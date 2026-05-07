window.CREDCHECK_API_BASE =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1"
    ? "http://localhost:4000"
    : "https://credcheck-backend-dvcz.onrender.com";
