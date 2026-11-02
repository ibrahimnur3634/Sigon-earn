
const express = require("express");
const path = require("path");

const app = express();
const PORT = 3000;

// Serve files from the main project folder
app.use(express.static(__dirname));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => {
    console.log(`Sigon Earn running at http://localhost:${PORT}`);
});
