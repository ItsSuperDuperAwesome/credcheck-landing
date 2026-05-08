const isLocalCredCheck =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1" ||
  window.location.protocol === "file:";

window.CREDCHECK_API_BASE = isLocalCredCheck
  ? "http://localhost:4000"
  : "https://credcheck-backend-dvcz.onrender.com";
