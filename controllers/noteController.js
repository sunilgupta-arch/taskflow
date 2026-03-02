const NoteModel = require('../models/Note');
const { ApiResponse, getPaginationMeta } = require('../utils/response');

class NoteController {
  static async index(req, res) {
    try {
      const { page = 1, limit = 20, search } = req.query;
      const { rows, total } = await NoteModel.getAll({
        user_id: req.user.id,
        search,
        page,
        limit
      });

      res.render('notes/index', {
        title: 'My Notes',
        notes: rows,
        pagination: getPaginationMeta(total, page, limit),
        filters: { search }
      });
    } catch (err) {
      res.status(500).render('error', { title: 'Error', message: err.message, code: 500, layout: false });
    }
  }

  static async create(req, res) {
    try {
      const { title, content } = req.body;
      if (!title || !title.trim()) {
        return ApiResponse.error(res, 'Title is required', 400);
      }

      const noteId = await NoteModel.create({
        user_id: req.user.id,
        title: title.trim(),
        content: content ? content.trim() : null
      });

      const note = await NoteModel.findById(noteId);
      return ApiResponse.success(res, note, 'Note created successfully', 201);
    } catch (err) {
      return ApiResponse.error(res, err.message, 400);
    }
  }

  static async update(req, res) {
    try {
      const note = await NoteModel.findById(req.params.id);
      if (!note) return ApiResponse.error(res, 'Note not found', 404);
      if (note.user_id !== req.user.id) return ApiResponse.error(res, 'Access denied', 403);

      const { title, content } = req.body;
      if (!title || !title.trim()) {
        return ApiResponse.error(res, 'Title is required', 400);
      }

      await NoteModel.update(req.params.id, {
        title: title.trim(),
        content: content ? content.trim() : null
      });

      const updated = await NoteModel.findById(req.params.id);
      return ApiResponse.success(res, updated, 'Note updated successfully');
    } catch (err) {
      return ApiResponse.error(res, err.message, 400);
    }
  }

  static async destroy(req, res) {
    try {
      const note = await NoteModel.findById(req.params.id);
      if (!note) return ApiResponse.error(res, 'Note not found', 404);
      if (note.user_id !== req.user.id) return ApiResponse.error(res, 'Access denied', 403);

      await NoteModel.delete(req.params.id);
      return ApiResponse.success(res, {}, 'Note deleted successfully');
    } catch (err) {
      return ApiResponse.error(res, err.message, 400);
    }
  }
}

module.exports = NoteController;
