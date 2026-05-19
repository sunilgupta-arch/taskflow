const DevProject = require('../models/DevProject');
const DevThought = require('../models/DevThought');
const fs         = require('fs');
const pathMod    = require('path');

const ADMIN_ROLES  = ['LOCAL_ADMIN', 'LOCAL_MANAGER'];
const CLIENT_ROLES = ['CLIENT_ADMIN', 'CLIENT_MANAGER', 'CLIENT_TOP_MGMT'];

function isAdmin(user)       { return ADMIN_ROLES.includes(user.role_name); }
function isLocalAdmin(user)  { return user.role_name === 'LOCAL_ADMIN'; }
function isDev(user)         { return user.is_developer == 1; }
function isClient(user)      { return CLIENT_ROLES.includes(user.role_name); }

class DevWorkspaceController {

  // ── Page ─────────────────────────────────────────────────────────────

  static async index(req, res) {
    try {
      const developers = isLocalAdmin(req.user) ? await DevProject.getDevelopers() : [];
      res.render('admin/workspace', {
        title: 'Dev Workspace',
        layout: 'admin/layout',
        section: 'workspace',
        developers,
        isAdmin:       isAdmin(req.user),
        isLocalAdmin:  isLocalAdmin(req.user),
        isDev:         isDev(req.user),
        userId:        req.user.id,
        userName:      req.user.name
      });
    } catch (err) {
      console.error('DevWorkspace index error:', err);
      res.status(500).send('Server error');
    }
  }

  // ── Get projects (JSON) ───────────────────────────────────────────────

  static async getProjects(req, res) {
    try {
      const user = req.user;
      let projects;
      if (isLocalAdmin(user)) {
        const devId = req.query.developer_id ? parseInt(req.query.developer_id) : null;
        projects = await DevProject.getAll({ developerId: devId });
      } else {
        projects = await DevProject.getAll({ developerId: user.id });
      }
      return res.json({ success: true, data: projects });
    } catch (err) {
      console.error('DevWorkspace getProjects error:', err);
      return res.json({ success: false, message: 'Failed to load projects' });
    }
  }

  // ── Get single project with tasks ─────────────────────────────────────

  static async getProject(req, res) {
    try {
      const project = await DevProject.getById(parseInt(req.params.id));
      if (!project) return res.json({ success: false, message: 'Project not found' });
      if (!isAdmin(req.user) && project.developer_id !== req.user.id) {
        return res.json({ success: false, message: 'Access denied' });
      }
      return res.json({ success: true, data: project });
    } catch (err) {
      return res.json({ success: false, message: 'Failed to load project' });
    }
  }

  // ── Create project ────────────────────────────────────────────────────

  static async createProject(req, res) {
    try {
      const user = req.user;
      const { title, description, tech_stack, status, client_visible } = req.body;
      if (!title || !title.trim()) return res.json({ success: false, message: 'Title is required' });
      const developerId = isLocalAdmin(user) && req.body.developer_id ? parseInt(req.body.developer_id) : user.id;
      const id = await DevProject.create({ title: title.trim(), description, tech_stack, status, client_visible, developer_id: developerId });
      const project = await DevProject.getById(id);
      return res.json({ success: true, data: project, message: 'Project created' });
    } catch (err) {
      console.error('DevWorkspace createProject error:', err);
      return res.json({ success: false, message: 'Failed to create project' });
    }
  }

  // ── Update project ────────────────────────────────────────────────────

  static async updateProject(req, res) {
    try {
      const id = parseInt(req.params.id);
      if (!isAdmin(req.user) && !(await DevProject.ownedBy(id, req.user.id))) {
        return res.json({ success: false, message: 'Access denied' });
      }
      const { title, description, tech_stack, status, client_visible } = req.body;
      if (!title || !title.trim()) return res.json({ success: false, message: 'Title is required' });
      await DevProject.update(id, { title: title.trim(), description, tech_stack, status, client_visible });
      return res.json({ success: true, message: 'Project updated' });
    } catch (err) {
      return res.json({ success: false, message: 'Failed to update project' });
    }
  }

  // ── Delete project ────────────────────────────────────────────────────

  static async deleteProject(req, res) {
    try {
      const id = parseInt(req.params.id);
      if (!isAdmin(req.user) && !(await DevProject.ownedBy(id, req.user.id))) {
        return res.json({ success: false, message: 'Access denied' });
      }
      await DevProject.delete(id);
      return res.json({ success: true, message: 'Project deleted' });
    } catch (err) {
      return res.json({ success: false, message: 'Failed to delete project' });
    }
  }

  // ── Tasks ─────────────────────────────────────────────────────────────

  static async addTask(req, res) {
    try {
      const projectId = parseInt(req.params.id);
      if (!isAdmin(req.user) && !(await DevProject.ownedBy(projectId, req.user.id))) {
        return res.json({ success: false, message: 'Access denied' });
      }
      const { title, priority, due_date, milestone_id } = req.body;
      if (!title || !title.trim()) return res.json({ success: false, message: 'Task title required' });
      const taskId = await DevProject.addTask(projectId, { title: title.trim(), priority, due_date, milestone_id });
      return res.json({ success: true, data: { id: taskId, title: title.trim(), status: 'todo', priority: priority || 'medium' } });
    } catch (err) {
      return res.json({ success: false, message: 'Failed to add task' });
    }
  }

  static async updateTask(req, res) {
    try {
      const id = parseInt(req.params.taskId);
      const { title, status, priority, due_date, milestone_id } = req.body;
      await DevProject.updateTask(id, { title, status, priority, due_date, milestone_id });
      return res.json({ success: true });
    } catch (err) {
      return res.json({ success: false, message: 'Failed to update task' });
    }
  }

  static async deleteTask(req, res) {
    try {
      await DevProject.deleteTask(parseInt(req.params.taskId));
      return res.json({ success: true });
    } catch (err) {
      return res.json({ success: false, message: 'Failed to delete task' });
    }
  }

  // ── Milestones ────────────────────────────────────────────────────────

  static async addMilestone(req, res) {
    try {
      const projectId = parseInt(req.params.id);
      if (!isAdmin(req.user) && !(await DevProject.ownedBy(projectId, req.user.id))) return res.json({ success: false, message: 'Access denied' });
      const { title, due_date } = req.body;
      if (!title || !title.trim()) return res.json({ success: false, message: 'Title required' });
      const id = await DevProject.addMilestone(projectId, { title: title.trim(), due_date });
      return res.json({ success: true, data: { id, title: title.trim(), due_date: due_date || null, status: 'open' } });
    } catch (err) { return res.json({ success: false, message: 'Failed' }); }
  }

  static async updateMilestone(req, res) {
    try {
      await DevProject.updateMilestone(parseInt(req.params.milestoneId), req.body);
      return res.json({ success: true });
    } catch (err) { return res.json({ success: false, message: 'Failed' }); }
  }

  static async deleteMilestone(req, res) {
    try {
      await DevProject.deleteMilestone(parseInt(req.params.milestoneId));
      return res.json({ success: true });
    } catch (err) { return res.json({ success: false, message: 'Failed' }); }
  }

  // ── Links ─────────────────────────────────────────────────────────────

  static async addLink(req, res) {
    try {
      const projectId = parseInt(req.params.id);
      if (!isAdmin(req.user) && !(await DevProject.ownedBy(projectId, req.user.id))) return res.json({ success: false, message: 'Access denied' });
      const { label, url } = req.body;
      if (!label || !url) return res.json({ success: false, message: 'Label and URL required' });
      const id = await DevProject.addLink(projectId, { label: label.trim(), url: url.trim() });
      return res.json({ success: true, data: { id, label: label.trim(), url: url.trim() } });
    } catch (err) { return res.json({ success: false, message: 'Failed' }); }
  }

  static async deleteLink(req, res) {
    try {
      await DevProject.deleteLink(parseInt(req.params.linkId));
      return res.json({ success: true });
    } catch (err) { return res.json({ success: false, message: 'Failed' }); }
  }

  // ── Updates ───────────────────────────────────────────────────────────

  static async getUpdates(req, res) {
    try {
      const rows = await DevProject.getUpdates(parseInt(req.params.id));
      return res.json({ success: true, data: rows });
    } catch (err) { return res.json({ success: false, message: 'Failed' }); }
  }

  static async addUpdate(req, res) {
    try {
      const projectId = parseInt(req.params.id);
      const { body } = req.body;
      if (!body || !body.trim()) return res.json({ success: false, message: 'Update text required' });
      await DevProject.addUpdate(projectId, req.user.id, body.trim());
      const rows = await DevProject.getUpdates(projectId);
      return res.json({ success: true, data: rows });
    } catch (err) { return res.json({ success: false, message: 'Failed' }); }
  }

  // ── Comments ──────────────────────────────────────────────────────────

  static async getComments(req, res) {
    try {
      const rows = await DevProject.getComments(parseInt(req.params.id));
      return res.json({ success: true, data: rows });
    } catch (err) { return res.json({ success: false, message: 'Failed' }); }
  }

  static async addComment(req, res) {
    try {
      const projectId = parseInt(req.params.id);
      const { body } = req.body;
      if (!body || !body.trim()) return res.json({ success: false, message: 'Comment text required' });
      await DevProject.addComment(projectId, req.user.id, body.trim());
      const rows = await DevProject.getComments(projectId);
      return res.json({ success: true, data: rows });
    } catch (err) { return res.json({ success: false, message: 'Failed' }); }
  }

  static async deleteComment(req, res) {
    try {
      await DevProject.deleteComment(parseInt(req.params.commentId));
      return res.json({ success: true });
    } catch (err) { return res.json({ success: false, message: 'Failed' }); }
  }

  // ── Releases ──────────────────────────────────────────────────────────

  static async getReleases(req, res) {
    try {
      const rows = await DevProject.getReleases(parseInt(req.params.id));
      return res.json({ success: true, data: rows });
    } catch (err) { return res.json({ success: false, message: 'Failed' }); }
  }

  static async addRelease(req, res) {
    try {
      const projectId = parseInt(req.params.id);
      if (!isAdmin(req.user) && !(await DevProject.ownedBy(projectId, req.user.id))) return res.json({ success: false, message: 'Access denied' });
      const { version, environment, notes } = req.body;
      if (!version || !version.trim()) return res.json({ success: false, message: 'Version required' });
      await DevProject.addRelease(projectId, { version: version.trim(), environment, notes, released_by: req.user.id });
      const rows = await DevProject.getReleases(projectId);
      return res.json({ success: true, data: rows });
    } catch (err) { return res.json({ success: false, message: 'Failed' }); }
  }

  static async deleteRelease(req, res) {
    try {
      await DevProject.deleteRelease(parseInt(req.params.releaseId));
      return res.json({ success: true });
    } catch (err) { return res.json({ success: false, message: 'Failed' }); }
  }

  // ── Notes ─────────────────────────────────────────────────────────────

  static async getNotes(req, res) {
    try {
      const user = req.user;
      const notes = isAdmin(user)
        ? await DevProject.getNotes({ createdBy: user.id })
        : await DevProject.getNotes({ sharedWith: user.id });
      return res.json({ success: true, data: notes });
    } catch (err) {
      return res.json({ success: false, message: 'Failed to load notes' });
    }
  }

  static async getNote(req, res) {
    try {
      const note = await DevProject.getNoteById(parseInt(req.params.noteId));
      if (!note) return res.json({ success: false, message: 'Not found' });
      if (!isAdmin(req.user) && note.created_by !== req.user.id) {
        return res.json({ success: false, message: 'Access denied' });
      }
      return res.json({ success: true, data: note });
    } catch (err) {
      return res.json({ success: false, message: 'Failed to load note' });
    }
  }

  static async createNote(req, res) {
    try {
      if (!isAdmin(req.user)) return res.json({ success: false, message: 'Only admins can create notes' });
      const { title, body } = req.body;
      if (!title || !title.trim()) return res.json({ success: false, message: 'Title is required' });
      const id = await DevProject.createNote({ title: title.trim(), body, created_by: req.user.id });
      const note = await DevProject.getNoteById(id);
      return res.json({ success: true, data: note });
    } catch (err) {
      return res.json({ success: false, message: 'Failed to create note' });
    }
  }

  static async updateNote(req, res) {
    try {
      const id = parseInt(req.params.noteId);
      const note = await DevProject.getNoteById(id);
      if (!note || note.created_by !== req.user.id) return res.json({ success: false, message: 'Access denied' });
      const { title, body } = req.body;
      if (!title || !title.trim()) return res.json({ success: false, message: 'Title is required' });
      await DevProject.updateNote(id, { title: title.trim(), body });
      return res.json({ success: true });
    } catch (err) {
      return res.json({ success: false, message: 'Failed to update note' });
    }
  }

  static async deleteNote(req, res) {
    try {
      const id = parseInt(req.params.noteId);
      const note = await DevProject.getNoteById(id);
      if (!note || note.created_by !== req.user.id) return res.json({ success: false, message: 'Access denied' });
      await DevProject.deleteNote(id);
      return res.json({ success: true });
    } catch (err) {
      return res.json({ success: false, message: 'Failed to delete note' });
    }
  }

  static async shareNote(req, res) {
    try {
      const id = parseInt(req.params.noteId);
      const note = await DevProject.getNoteById(id);
      if (!note || note.created_by !== req.user.id) return res.json({ success: false, message: 'Access denied' });
      const { developer_ids } = req.body;
      await DevProject.setNoteShares(id, developer_ids || []);
      return res.json({ success: true, message: developer_ids && developer_ids.length ? 'Note shared' : 'Shares cleared' });
    } catch (err) {
      return res.json({ success: false, message: 'Failed to share note' });
    }
  }

  // ── Thoughts helpers ─────────────────────────────────────────────────

  static _saveThoughtFiles(files, authorId, uploadDir) {
    const saved = [];
    for (const f of files) {
      const safeName = f.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      const fname    = Date.now() + '-' + Math.random().toString(36).slice(2) + '-' + safeName;
      fs.writeFileSync(pathMod.join(uploadDir, fname), f.buffer);
      saved.push({ file_name: f.originalname, file_path: 'thoughts/' + fname, file_mime: f.mimetype, file_size: f.size, uploaded_by: authorId });
    }
    return saved;
  }

  static _thoughtsUploadDir() {
    const dir = pathMod.join(__dirname, '..', 'uploads', 'thoughts');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  // ── Thoughts — local side (LOCAL_ADMIN + is_dev) ──────────────────────

  static async getThoughts(req, res) {
    try {
      const rows = await DevThought.list();
      return res.json({ success: true, data: rows });
    } catch (err) {
      return res.json({ success: false, message: 'Failed to load thoughts' });
    }
  }

  static async getThought(req, res) {
    try {
      const thought = await DevThought.getById(parseInt(req.params.id));
      if (!thought) return res.json({ success: false, message: 'Not found' });
      return res.json({ success: true, data: thought });
    } catch (err) {
      return res.json({ success: false, message: 'Failed to load thought' });
    }
  }

  static async deleteThought(req, res) {
    return res.status(403).json({ success: false, message: 'Only the client can delete thoughts' });
  }

  static async addThoughtComment(req, res) {
    try {
      const thoughtId = parseInt(req.params.id);
      const { body } = req.body;
      if (!body || !body.trim()) return res.json({ success: false, message: 'Comment text required' });
      const commentId = await DevThought.addComment({ thought_id: thoughtId, author_id: req.user.id, body: body.trim() });
      if (req.files && req.files.length) {
        const dir = DevWorkspaceController._thoughtsUploadDir();
        for (const finfo of DevWorkspaceController._saveThoughtFiles(req.files, req.user.id, dir)) {
          await DevThought.addCommentFile(commentId, finfo);
        }
      }
      const thought = await DevThought.getById(thoughtId);
      return res.json({ success: true, data: thought });
    } catch (err) {
      console.error('addThoughtComment error:', err);
      return res.json({ success: false, message: 'Failed to add comment' });
    }
  }

  static async deleteThoughtComment(req, res) {
    try {
      const id      = parseInt(req.params.commentId);
      const comment = await DevThought.getCommentById(id);
      if (!comment) return res.json({ success: false, message: 'Not found' });
      if (!isAdmin(req.user) && comment.author_id !== req.user.id) {
        return res.json({ success: false, message: 'Access denied' });
      }
      await DevThought.deleteComment(id);
      return res.json({ success: true });
    } catch (err) {
      return res.json({ success: false, message: 'Failed to delete comment' });
    }
  }

  static async serveThoughtFile(req, res) {
    try {
      const f = await DevThought.getFile(parseInt(req.params.fileId));
      if (!f) return res.status(404).send('Not found');
      const abs = pathMod.join(__dirname, '..', 'uploads', f.file_path);
      res.setHeader('Content-Disposition', 'attachment; filename="' + f.file_name + '"');
      res.sendFile(abs);
    } catch (err) { res.status(500).send('Error'); }
  }

  static async serveThoughtCommentFile(req, res) {
    try {
      const f = await DevThought.getCommentFile(parseInt(req.params.fileId));
      if (!f) return res.status(404).send('Not found');
      const abs = pathMod.join(__dirname, '..', 'uploads', f.file_path);
      res.setHeader('Content-Disposition', 'attachment; filename="' + f.file_name + '"');
      res.sendFile(abs);
    } catch (err) { res.status(500).send('Error'); }
  }

  // ── Portal (client-facing, read-only) ────────────────────────────────

  static async portalIndex(req, res) {
    try {
      res.render('portal/workspace', {
        title: 'Dev Workspace',
        layout: 'portal/layout',
        section: 'workspace'
      });
    } catch (err) {
      res.status(500).send('Server error');
    }
  }

  static async portalGetProjects(req, res) {
    try {
      const projects = await DevProject.getAll({ clientVisibleOnly: true });
      return res.json({ success: true, data: projects });
    } catch (err) {
      return res.json({ success: false, message: 'Failed to load projects' });
    }
  }

  static async portalGetProject(req, res) {
    try {
      const project = await DevProject.getById(parseInt(req.params.id));
      if (!project || !project.client_visible) {
        return res.json({ success: false, message: 'Not found' });
      }
      return res.json({ success: true, data: project });
    } catch (err) {
      return res.json({ success: false, message: 'Failed to load project' });
    }
  }

  static async portalGetUpdates(req, res) {
    try {
      const id = parseInt(req.params.id);
      const project = await DevProject.getById(id);
      if (!project || !project.client_visible) return res.json({ success: false, message: 'Not found' });
      const rows = await DevProject.getUpdates(id);
      return res.json({ success: true, data: rows });
    } catch (err) {
      return res.json({ success: false, message: 'Failed' });
    }
  }

  static async portalGetReleases(req, res) {
    try {
      const id = parseInt(req.params.id);
      const project = await DevProject.getById(id);
      if (!project || !project.client_visible) return res.json({ success: false, message: 'Not found' });
      const rows = await DevProject.getReleases(id);
      return res.json({ success: true, data: rows });
    } catch (err) {
      return res.json({ success: false, message: 'Failed' });
    }
  }

  // ── Portal Thoughts (CLIENT_ADMIN posts; CLIENT_ADMIN comments) ───────

  static async portalGetThoughts(req, res) {
    try {
      const rows = await DevThought.list();
      return res.json({ success: true, data: rows });
    } catch (err) {
      return res.json({ success: false, message: 'Failed to load thoughts' });
    }
  }

  static async portalGetThought(req, res) {
    try {
      const thought = await DevThought.getById(parseInt(req.params.id));
      if (!thought) return res.json({ success: false, message: 'Not found' });
      return res.json({ success: true, data: thought });
    } catch (err) {
      return res.json({ success: false, message: 'Failed' });
    }
  }

  static async portalPostThought(req, res) {
    try {
      const { title, body } = req.body;
      if (!title || !title.trim()) return res.json({ success: false, message: 'Title is required' });
      if (!body || !body.trim())   return res.json({ success: false, message: 'Body is required' });
      const dir      = DevWorkspaceController._thoughtsUploadDir();
      const thoughtId = await DevThought.create({ author_id: req.user.id, title: title.trim(), body: body.trim() });
      if (req.files && req.files.length) {
        for (const finfo of DevWorkspaceController._saveThoughtFiles(req.files, req.user.id, dir)) {
          await DevThought.addFile(thoughtId, finfo);
        }
      }
      const rows = await DevThought.list();
      return res.json({ success: true, data: rows, message: 'Thought posted' });
    } catch (err) {
      console.error('portalPostThought error:', err);
      return res.json({ success: false, message: 'Failed to post thought' });
    }
  }

  static async portalDeleteThought(req, res) {
    try {
      const id      = parseInt(req.params.thoughtId);
      const thought = await DevThought.getById(id);
      if (!thought) return res.json({ success: false, message: 'Not found' });
      if (thought.author_id !== req.user.id) return res.json({ success: false, message: 'Access denied' });
      await DevThought.delete(id);
      return res.json({ success: true });
    } catch (err) {
      return res.json({ success: false, message: 'Failed to delete thought' });
    }
  }

  static async portalAddThoughtComment(req, res) {
    try {
      const thoughtId = parseInt(req.params.id);
      const { body } = req.body;
      if (!body || !body.trim()) return res.json({ success: false, message: 'Comment text required' });
      const commentId = await DevThought.addComment({ thought_id: thoughtId, author_id: req.user.id, body: body.trim() });
      if (req.files && req.files.length) {
        const dir = DevWorkspaceController._thoughtsUploadDir();
        for (const finfo of DevWorkspaceController._saveThoughtFiles(req.files, req.user.id, dir)) {
          await DevThought.addCommentFile(commentId, finfo);
        }
      }
      const thought = await DevThought.getById(thoughtId);
      return res.json({ success: true, data: thought });
    } catch (err) {
      return res.json({ success: false, message: 'Failed to add comment' });
    }
  }

  static async portalDeleteThoughtComment(req, res) {
    try {
      const id      = parseInt(req.params.commentId);
      const comment = await DevThought.getCommentById(id);
      if (!comment) return res.json({ success: false, message: 'Not found' });
      if (comment.author_id !== req.user.id) return res.json({ success: false, message: 'Access denied' });
      await DevThought.deleteComment(id);
      return res.json({ success: true });
    } catch (err) {
      return res.json({ success: false, message: 'Failed to delete comment' });
    }
  }

  static async portalServeThoughtFile(req, res) {
    try {
      const f = await DevThought.getFile(parseInt(req.params.fileId));
      if (!f) return res.status(404).send('Not found');
      const abs = pathMod.join(__dirname, '..', 'uploads', f.file_path);
      res.setHeader('Content-Disposition', 'attachment; filename="' + f.file_name + '"');
      res.sendFile(abs);
    } catch (err) { res.status(500).send('Error'); }
  }

  static async portalServeThoughtCommentFile(req, res) {
    try {
      const f = await DevThought.getCommentFile(parseInt(req.params.fileId));
      if (!f) return res.status(404).send('Not found');
      const abs = pathMod.join(__dirname, '..', 'uploads', f.file_path);
      res.setHeader('Content-Disposition', 'attachment; filename="' + f.file_name + '"');
      res.sendFile(abs);
    } catch (err) { res.status(500).send('Error'); }
  }
}

module.exports = DevWorkspaceController;
