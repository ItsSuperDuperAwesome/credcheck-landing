import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { supabase } from "./supabaseClient.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((origin) => origin.trim())
  : true;

app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && "body" in err) {
    return res.status(400).json({ error: "Invalid JSON body." });
  }

  next(err);
});

function normalizeCoursePayload(body) {
  return {
    title: body.title?.trim(),
    creator_name: (body.creator_name || body.creator || "").trim() || null,
    niche: Array.isArray(body.niche)
      ? body.niche.join(", ")
      : Array.isArray(body.niches)
        ? body.niches.join(", ")
        : (body.niche || body.niches || "").trim() || null,
    description: body.description?.trim() || null,
    thumbnail_url: (body.thumbnail_url || body.image_url || body.thumbnail || body.image || "").trim() || null,
  };
}

function normalizeReviewPayload(body) {
  return {
    course_id: body.course_id,
    reviewer_name: (body.reviewer_name || body.name || "").trim() || null,
    rating: Number(body.rating),
    comment: (body.comment || body.text || "").trim() || null,
  };
}

function publicError(err) {
  return err?.message || "Unexpected server error.";
}

/* ========== HEALTH CHECK ========== */
app.get("/", (req, res) => {
  res.json({ ok: true, message: "CredCheck backend is running." });
});

/* ========== COURSES ROUTES ========== */

// Get all courses
app.get("/api/courses", async (req, res) => {
  try {
    console.log("[GET] /api/courses");

    const { data: courses, error: coursesError } = await supabase
      .from("courses")
      .select("*")
      .order("created_at", { ascending: false });

    if (coursesError) throw coursesError;

    const { data: reviews, error: reviewsError } = await supabase
      .from("reviews")
      .select("course_id, rating");

    if (reviewsError) throw reviewsError;

    const ratingStats = (reviews || []).reduce((stats, review) => {
      const rating = Number(review.rating);
      if (!Number.isFinite(rating)) return stats;

      if (!stats[review.course_id]) {
        stats[review.course_id] = { total: 0, count: 0 };
      }

      stats[review.course_id].total += rating;
      stats[review.course_id].count += 1;
      return stats;
    }, {});

    const enrichedCourses = (courses || []).map((course) => {
      const stats = ratingStats[course.id];
      return {
        ...course,
        average_rating: stats ? stats.total / stats.count : null,
        review_count: stats ? stats.count : 0,
      };
    });

    res.json(enrichedCourses);
  } catch (err) {
    console.error("[GET] /api/courses failed:", err);
    res.status(500).json({ error: publicError(err) });
  }
});

// Add new course (admin use)
app.post("/api/courses", async (req, res) => {
  console.log("POST /api/courses hit");
  try {
    const course = normalizeCoursePayload(req.body);
    console.log("[POST] /api/courses", { title: course.title });

    if (!course.title) {
      return res.status(400).json({ error: "title is required." });
    }

    const { data, error } = await supabase
      .from("courses")
      .insert([course])
      .select();

    if (error) throw error;
    res.status(201).json(data[0]);
  } catch (err) {
    console.error("[POST] /api/courses failed:", err);
    res.status(500).json({ error: publicError(err) });
  }
});

// Update course (admin use)
app.put("/api/courses/:id", async (req, res) => {
  console.log("PUT /api/courses/:id hit", req.params.id);
  try {
    const { id } = req.params;
    const course = normalizeCoursePayload(req.body);
    console.log("[PUT] /api/courses/:id", { id, title: course.title });

    if (!id) {
      return res.status(400).json({ error: "course id is required." });
    }

    if (!course.title) {
      return res.status(400).json({ error: "title is required." });
    }

    const { data, error } = await supabase
      .from("courses")
      .update(course)
      .eq("id", id)
      .select();

    if (error) throw error;

    if (data?.[0]) {
      return res.json(data[0]);
    }

    const { data: refreshedCourse, error: refreshError } = await supabase
      .from("courses")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (refreshError) throw refreshError;

    if (!refreshedCourse) {
      return res.status(404).json({ error: "Course not found." });
    }

    res.json(refreshedCourse);
  } catch (err) {
    console.error("[PUT] /api/courses/:id failed:", err);
    res.status(500).json({ error: publicError(err) });
  }
});

// Delete course (admin use)
app.delete("/api/courses/:id", async (req, res) => {
  console.log("DELETE /api/courses/:id hit", req.params.id);
  try {
    const { id } = req.params;
    console.log("[DELETE] /api/courses/:id", { id });

    if (!id) {
      return res.status(400).json({ error: "course id is required." });
    }

    const { error: reviewsError } = await supabase
      .from("reviews")
      .delete()
      .eq("course_id", id);

    if (reviewsError) throw reviewsError;

    const { error } = await supabase
      .from("courses")
      .delete()
      .eq("id", id);

    if (error) throw error;

    const { data: remainingCourse, error: verifyError } = await supabase
      .from("courses")
      .select("id")
      .eq("id", id)
      .maybeSingle();

    if (verifyError) throw verifyError;

    if (remainingCourse) {
      return res.status(500).json({ error: "Course delete did not persist." });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("[DELETE] /api/courses/:id failed:", err);
    res.status(500).json({ error: publicError(err) });
  }
});

/* ========== REVIEWS ROUTES ========== */

// Get reviews by course_id
app.get("/api/reviews", async (req, res) => {
  try {
    const { course_id } = req.query;
    console.log("[GET] /api/reviews", { course_id });

    if (!course_id) {
      return res.status(400).json({ error: "Missing course_id parameter." });
    }

    const { data, error } = await supabase
      .from("reviews")
      .select("*")
      .eq("course_id", course_id)
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error("[GET] /api/reviews failed:", err);
    res.status(500).json({ error: publicError(err) });
  }
});

// Add a review
app.post("/api/reviews", async (req, res) => {
  try {
    const review = normalizeReviewPayload(req.body);
    console.log("[POST] /api/reviews", {
      course_id: review.course_id,
      rating: review.rating,
    });

    if (!review.course_id) {
      return res
        .status(400)
        .json({ error: "course_id is required." });
    }

    if (!Number.isInteger(review.rating) || review.rating < 1 || review.rating > 5) {
      return res
        .status(400)
        .json({ error: "rating must be an integer between 1 and 5." });
    }

    const { data, error } = await supabase
      .from("reviews")
      .insert([review])
      .select();

    if (error) throw error;
    res.status(201).json(data[0]);
  } catch (err) {
    console.error("[POST] /api/reviews failed:", err);
    res.status(500).json({ error: publicError(err) });
  }
});

app.use("/api", (req, res) => {
  res.status(404).json({ error: "API route not found." });
});

/* ========== SERVER START ========== */
app.listen(PORT, () => {
  console.log(`CredCheck API running on port ${PORT}`);
});
