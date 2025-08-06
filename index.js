const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const pdf = require("pdf-parse");
require("dotenv").config(); // Load environment variables
const app = express();

// Set EJS as view engine
app.set("view engine", "ejs");

// Connect to MongoDB Atlas
mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 60000,
    socketTimeoutMS: 90000,
  })
  .THEN(() => console.log("Connected to MongoDB Atlas"))
  .catch((err) => console.error("MongoDB connection error:", err));

// ... (rest of the code remains unchanged, including GridFS, routes, etc.)
// Initialize GridFSBucket
let gridfsBucket;
mongoose.connection.once("open", () => {
  gridfsBucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
    bucketName: "files",
  });
  console.log("GridFS initialized");
});

// File Schema (for metadata, optional)
const fileSchema = new mongoose.Schema({
  filename: String,
  contentType: String,
  length: Number,
  uploadDate: { type: Date, default: Date.now },
});
const File = mongoose.model("File", fileSchema);

// Configure Multer
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Routes
app.get("/", (req, res) => {
  res.render("index");
});

app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!gridfsBucket) {
      throw new Error("GridFS not initialized");
    }
    console.log("Starting file upload...");
    console.log("File size:", req.file.size / (1024 * 1024), "MB");

    // Create a GridFS write stream
    const writeStream = gridfsBucket.openUploadStream(req.file.originalname, {
      contentType: req.file.mimetype,
    });

    // Write file buffer to GridFS
    writeStream.write(req.file.buffer);
    writeStream.end();

    writeStream.on("finish", async () => {
      // Save metadata to File model
      const newFile = new File({
        filename: req.file.originalname,
        contentType: req.file.mimetype,
        length: req.file.size,
      });
      await newFile.save();
      console.log("File saved successfully");
      res.send("File uploaded successfully!");
    });

    writeStream.on("error", (err) => {
      console.error("GridFS error:", err);
      res.status(500).send("Error uploading file: " + err.message);
    });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).send("Error uploading file: " + err.message);
  }
});

app.get("/file/:id", async (req, res) => {
  try {
    if (!gridfsBucket) {
      throw new Error("GridFS not initialized");
    }
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).send("Invalid file ID");
    }
    const fileId = new mongoose.Types.ObjectId(req.params.id);
    const readStream = gridfsBucket.openDownloadStream(fileId);
    readStream.pipe(res);
    readStream.on("error", (err) => {
      res.status(404).send("File not found: " + err.message);
    });
  } catch (err) {
    console.error("Retrieve error:", err);
    res.status(500).send("Error retrieving file: " + err.message);
  }
});

app.get("/file/:id/text", async (req, res) => {
  try {
    if (!gridfsBucket) {
      throw new Error("GridFS not_initialized");
    }
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).send("Invalid file ID");
    }
    const fileId = new mongoose.Types.ObjectId(req.params.id);
    const readStream = gridfsBucket.openDownloadStream(fileId);
    let dataBuffer = Buffer.alloc(0);
    readStream.on("data", (chunk) => {
      dataBuffer = Buffer.concat([dataBuffer, chunk]);
    });
    readStream.on("end", async () => {
      try {
        const data = await pdf(dataBuffer);
        res.json({ text: data.text });
      } catch (err) {
        res.status(500).send("Error extracting text: " + err.message);
      }
    });
    readStream.on("error", (err) => {
      res.status(404).send("File not found: " + err.message);
    });
  } catch (err) {
    console.error("Retrieve error:", err);
    res.status(500).send("Error retrieving file: " + err.message);
  }
});

app.get("/files", async (req, res) => {
  try {
    const files = await File.find();
    res.render("files", { files });
  } catch (err) {
    console.error("List files error:", err);
    res.status(500).send("Error retrieving files: " + err.message);
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Server error:", err.stack);
  res.status(500).send("Something went wrong!");
});

// Start server after MongoDB connection
mongoose.connection.once("open", () => {
  app.listen(3000, () => {
    console.log("Listening on port 3000");
  });
});