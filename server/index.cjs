const express = require("express");

const app = express();
app.use(express.json());

app.post("/api/ping", (req, res) => {
  const message = String((req.body && req.body.message) ?? "");
  res.json({
    ok: true,
    echo: message,
    serverTime: new Date().toISOString(),
  });
});

app.listen(8787, () => {
  console.log("server listening on http://localhost:8787");
});
