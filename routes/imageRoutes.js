require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const { GridFsStorage } = require("multer-gridfs-storage");
const multer = require("multer");
const crypto = require("crypto");
const path = require("path");
const router = express.Router();
const MONGO_URI = process.env.MONGO_URI;

const conn = mongoose.createConnection(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

let gfs;

conn.once("open", () => {
  gfs = new mongoose.mongo.GridFSBucket(conn.db, {
    bucketName: "images",
  });
});

const storage = new GridFsStorage({
  url: MONGO_URI,
  options: { useUnifiedTopology: true },
  file: (req, file) => {
    return new Promise((resolve, reject) => {
      crypto.randomBytes(16, (err, buf) => {
        if (err) {
          return reject(err);
        }
        const filename = buf.toString("hex") + path.extname(file.originalname);
        const fileInfo = {
          filename: filename,
          bucketName: "images",
        };
        resolve(fileInfo);
      });
    });
  },
});
const filefilter = (req, file, cb) => {
  const match = ["img/png", "img/jpeg", "img/jpg"];
  if (match.indexOf(file.mimetype) !== -1) {
    cb(null, true);
  } else {
    cb(new Error("type error"));
  }
};

const store = multer({ storage, filefilter });

const uploadMiddleware = (req, res, next) => {
  const upload = store.single("image");
  upload(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).send("File too large");
    } else if (err) {
      if (err === "filetype") return res.status(400).send("Image files only");
      return res.sendStatus(500);
    }
    next();
  });
};

router.post("/upload", uploadMiddleware, async (req, res) => {
  const { file } = req;
  const { id } = file;
  if (file.size > 5e7) {
    deleteImage(id);
    return res.status(400).send("file may not exceed 5mb");
  }

  return res.send(file.id);
});

const deleteImage = (id) => {
  if (!id || id === "undefined") return res.status(400).send("no image id");
  const _id = new mongoose.Types.ObjectId(id);
  gfs.delete(_id, (err) => {
    if (err) return res.status(500).send("image deletion error");
  });
};

router.get("/", (req, res) => {
  gfs.find().toArray((err, files) => {
    if (!files || files.length === 0) {
      return res.status(400).send("no files exist");
    }
    return res.status(200).send(files);
  });
});

router.get("/:id", (req, res) => {
  if (!req.params.id || req.params.id === "undefined")
    return res.status(400).send("no image id");
  const _id = new mongoose.Types.ObjectId(req.params.id);
  gfs.find({ _id }).toArray((err, files) => {
    if (!files || files.length === 0)
      return res.status(400).send("no files exist");
  });
  gfs.openDownloadStream(_id).pipe(res);
});

module.exports = router;
