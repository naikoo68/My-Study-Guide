import Document from "../models/Document.js";

// GET /api/documents — admin: list all (lightweight; omits the full text body).
export async function listDocuments(req, res) {
  const docs = await Document.find()
    .select("title sourceName pages createdAt updatedAt")
    .sort({ createdAt: -1 })
    .lean();
  res.json(docs);
}

// GET /api/documents/:id — admin: a single document including its full text.
export async function getDocument(req, res) {
  const doc = await Document.findById(req.params.id).lean();
  if (!doc) return res.status(404).json({ message: "Document not found" });
  res.json(doc);
}

// POST /api/documents — admin: create a new document.
export async function createDocument(req, res) {
  const { title, content = "", sourceName = "", pages = 0 } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ message: "Title is required" });
  const doc = await Document.create({
    title: title.trim(),
    content: String(content || ""),
    sourceName: String(sourceName || "").trim(),
    pages: Math.max(0, parseInt(pages, 10) || 0),
    createdBy: req.user?._id,
  });
  res.status(201).json(doc);
}

// PUT /api/documents/:id — admin: update title/content.
export async function updateDocument(req, res) {
  const patch = {};
  if ("title" in req.body) patch.title = String(req.body.title || "").trim();
  if ("content" in req.body) patch.content = String(req.body.content || "");
  if (patch.title === "") return res.status(400).json({ message: "Title is required" });
  const doc = await Document.findByIdAndUpdate(req.params.id, patch, { new: true });
  if (!doc) return res.status(404).json({ message: "Document not found" });
  res.json(doc);
}

// DELETE /api/documents/:id — admin.
export async function deleteDocument(req, res) {
  const doc = await Document.findByIdAndDelete(req.params.id);
  if (!doc) return res.status(404).json({ message: "Document not found" });
  res.json({ message: "Document deleted" });
}
