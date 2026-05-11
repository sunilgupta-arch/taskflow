const { google } = require('googleapis');
const { Readable } = require('stream');
const db = require('../config/db');

// OAuth2 client setup
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET
);

oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN
});

const drive = google.drive({ version: 'v3', auth: oauth2Client });

const ROOT_FOLDER_ID = process.env.TMS_FOLDER_ID;

// Shared drive flags — required for all API calls on shared drive items
const SHARED_DRIVE_PARAMS = {
  supportsAllDrives: true,
  includeItemsFromAllDrives: true
};

class GoogleDriveService {

  // Get or create the user's personal folder inside the shared root
  static async getUserFolder(user) {
    // Already has a folder linked
    if (user.drive_folder_id) {
      // Verify it still exists
      try {
        await drive.files.get({ fileId: user.drive_folder_id, fields: 'id,trashed', ...SHARED_DRIVE_PARAMS });
        return user.drive_folder_id;
      } catch (e) {
        // Folder was deleted/trashed — recreate
      }
    }

    // Search for existing folder by name
    const folderName = `${user.name} (${user.id})`;
    const searchRes = await drive.files.list({
      q: `'${ROOT_FOLDER_ID}' in parents AND name = '${folderName.replace(/'/g, "\\'")}' AND mimeType = 'application/vnd.google-apps.folder' AND trashed = false`,
      fields: 'files(id,name)',
      corpora: 'allDrives',
      ...SHARED_DRIVE_PARAMS
    });

    let folderId;

    if (searchRes.data.files.length > 0) {
      folderId = searchRes.data.files[0].id;
    } else {
      // Create folder
      const folderRes = await drive.files.create({
        requestBody: {
          name: folderName,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [ROOT_FOLDER_ID]
        },
        fields: 'id',
        ...SHARED_DRIVE_PARAMS
      });
      folderId = folderRes.data.id;
    }

    // Save to DB
    await db.query('UPDATE users SET drive_folder_id = ? WHERE id = ?', [folderId, user.id]);

    return folderId;
  }

  // Get or create the chat_attachments subfolder inside user's drive folder
  static async getChatAttachmentsFolder(userFolderId) {
    const folderName = 'chat_attachments';

    const searchRes = await drive.files.list({
      q: `'${userFolderId}' in parents AND name = '${folderName}' AND mimeType = 'application/vnd.google-apps.folder' AND trashed = false`,
      fields: 'files(id)',
      corpora: 'allDrives',
      ...SHARED_DRIVE_PARAMS
    });

    if (searchRes.data.files.length > 0) {
      return searchRes.data.files[0].id;
    }

    const folderRes = await drive.files.create({
      requestBody: {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [userFolderId]
      },
      fields: 'id',
      ...SHARED_DRIVE_PARAMS
    });

    return folderRes.data.id;
  }

  // Upload a chat attachment to the user's chat_attachments folder, returns drive file info
  static async uploadChatAttachment(userFolderId, file) {
    const attachFolderId = await this.getChatAttachmentsFolder(userFolderId);

    const stream = new Readable();
    stream.push(file.buffer);
    stream.push(null);

    const res = await drive.files.create({
      requestBody: {
        name: file.originalname,
        parents: [attachFolderId]
      },
      media: {
        mimeType: file.mimetype,
        body: stream
      },
      fields: 'id,name,mimeType,size,webViewLink,webContentLink',
      ...SHARED_DRIVE_PARAMS
    });

    return res.data;
  }

  // List files in user's folder (supports subfolder navigation)
  static async listFiles(folderId, subfolderId) {
    const parentId = subfolderId || folderId;

    const res = await drive.files.list({
      q: `'${parentId}' in parents AND trashed = false`,
      fields: 'files(id,name,mimeType,size,createdTime,modifiedTime,iconLink,thumbnailLink,webViewLink,webContentLink)',
      orderBy: 'folder,name',
      pageSize: 200,
      corpora: 'allDrives',
      ...SHARED_DRIVE_PARAMS
    });

    return res.data.files.map(f => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      isFolder: f.mimeType === 'application/vnd.google-apps.folder',
      size: f.size ? parseInt(f.size) : 0,
      createdTime: f.createdTime,
      modifiedTime: f.modifiedTime,
      iconLink: f.iconLink,
      thumbnailLink: f.thumbnailLink,
      webViewLink: f.webViewLink,
      webContentLink: f.webContentLink
    }));
  }

  // Create a subfolder
  static async createFolder(parentId, name) {
    const res = await drive.files.create({
      requestBody: {
        name: name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId]
      },
      fields: 'id,name',
      ...SHARED_DRIVE_PARAMS
    });
    return res.data;
  }

  // Upload a file
  static async uploadFile(parentId, file) {
    const stream = new Readable();
    stream.push(file.buffer);
    stream.push(null);

    const res = await drive.files.create({
      requestBody: {
        name: file.originalname,
        parents: [parentId]
      },
      media: {
        mimeType: file.mimetype,
        body: stream
      },
      fields: 'id,name,mimeType,size,createdTime,modifiedTime,webViewLink,webContentLink',
      ...SHARED_DRIVE_PARAMS
    });

    return res.data;
  }

  // Generic: upload a buffer to a specific Drive folder (used for all chat/attachment features)
  static async uploadToFolder(folderId, file) {
    if (!folderId) throw new Error('Drive folder ID not configured');

    const stream = new Readable();
    stream.push(file.buffer);
    stream.push(null);

    const uniqueName = `${Date.now()}_${file.originalname}`;

    const res = await drive.files.create({
      requestBody: {
        name: uniqueName,
        parents: [folderId]
      },
      media: {
        mimeType: file.mimetype,
        body: stream
      },
      fields: 'id,name,mimeType,size,webViewLink',
      ...SHARED_DRIVE_PARAMS
    });

    return res.data;
  }

  // Backwards-compat wrapper for Group Channel
  static async uploadGroupChannelAttachment(file) {
    return this.uploadToFolder(process.env.GC_DRIVE_FOLDER_ID, file);
  }

  // Upload a client request attachment (uses CR_DRIVE_FOLDER_ID or root)
  static async uploadRequestAttachment(file) {
    const folderId = process.env.CR_DRIVE_FOLDER_ID || ROOT_FOLDER_ID;
    if (!folderId) throw new Error('Drive folder ID not configured');

    const stream = new Readable();
    stream.push(file.buffer);
    stream.push(null);

    const res = await drive.files.create({
      requestBody: {
        name: `${Date.now()}_${file.originalname}`,
        parents: [folderId]
      },
      media: { mimeType: file.mimetype, body: stream },
      fields: 'id,name,mimeType,size,webViewLink',
      ...SHARED_DRIVE_PARAMS
    });

    return res.data;
  }

  // Copy a file to a target folder (used for "Save to Drive")
  static async copyFile(sourceFileId, targetFolderId, newName) {
    const res = await drive.files.copy({
      fileId: sourceFileId,
      requestBody: {
        name: newName || undefined,
        parents: [targetFolderId]
      },
      fields: 'id,name,webViewLink',
      ...SHARED_DRIVE_PARAMS
    });
    return res.data;
  }

  // Rename a file/folder
  static async renameFile(fileId, newName) {
    const res = await drive.files.update({
      fileId: fileId,
      requestBody: { name: newName },
      fields: 'id,name',
      ...SHARED_DRIVE_PARAMS
    });
    return res.data;
  }

  // Delete a file/folder (move to trash)
  static async deleteFile(fileId) {
    await drive.files.update({
      fileId: fileId,
      requestBody: { trashed: true },
      ...SHARED_DRIVE_PARAMS
    });
  }

  // Get file metadata
  static async getFile(fileId) {
    const res = await drive.files.get({
      fileId: fileId,
      fields: 'id,name,mimeType,size,parents,createdTime,modifiedTime,webViewLink,webContentLink',
      ...SHARED_DRIVE_PARAMS
    });
    return res.data;
  }

  // Download file content (returns stream)
  static async downloadFile(fileId) {
    const meta = await drive.files.get({ fileId, fields: 'name,mimeType', ...SHARED_DRIVE_PARAMS });
    const res = await drive.files.get({ fileId, alt: 'media', ...SHARED_DRIVE_PARAMS }, { responseType: 'stream' });
    return { stream: res.data, name: meta.data.name, mimeType: meta.data.mimeType };
  }

  // Check if a file/folder belongs to a given parent (recursive check)
  static async isInsideFolder(fileId, rootFolderId) {
    try {
      const file = await drive.files.get({ fileId, fields: 'parents', ...SHARED_DRIVE_PARAMS });
      if (!file.data.parents || file.data.parents.length === 0) return false;
      if (file.data.parents.includes(rootFolderId)) return true;
      // Recurse up
      return this.isInsideFolder(file.data.parents[0], rootFolderId);
    } catch (e) {
      return false;
    }
  }

  // Get or create the db_backup folder under root
  static async getBackupFolder() {
    const folderName = 'db_backup';

    const searchRes = await drive.files.list({
      q: `'${ROOT_FOLDER_ID}' in parents AND name = '${folderName}' AND mimeType = 'application/vnd.google-apps.folder' AND trashed = false`,
      fields: 'files(id)',
      corpora: 'allDrives',
      ...SHARED_DRIVE_PARAMS
    });

    if (searchRes.data.files.length > 0) {
      return searchRes.data.files[0].id;
    }

    const folderRes = await drive.files.create({
      requestBody: {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [ROOT_FOLDER_ID]
      },
      fields: 'id',
      ...SHARED_DRIVE_PARAMS
    });

    return folderRes.data.id;
  }

  // Upload a backup .sql file from disk to db_backup folder
  static async uploadBackupToDrive(filePath, fileName) {
    const fs = require('fs');
    const backupFolderId = await this.getBackupFolder();

    const res = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [backupFolderId]
      },
      media: {
        mimeType: 'application/sql',
        body: fs.createReadStream(filePath)
      },
      fields: 'id,name,size,createdTime,webViewLink',
      ...SHARED_DRIVE_PARAMS
    });

    return res.data;
  }

  // List all backup files in db_backup folder, sorted latest first
  static async listBackupFiles() {
    const backupFolderId = await this.getBackupFolder();

    const res = await drive.files.list({
      q: `'${backupFolderId}' in parents AND trashed = false`,
      fields: 'files(id,name,size,createdTime,modifiedTime)',
      orderBy: 'createdTime desc',
      pageSize: 100,
      corpora: 'allDrives',
      ...SHARED_DRIVE_PARAMS
    });

    return res.data.files;
  }

  // Download a backup file from drive and return as buffer
  static async downloadBackupBuffer(fileId) {
    const meta = await drive.files.get({ fileId, fields: 'name,mimeType', ...SHARED_DRIVE_PARAMS });
    const res = await drive.files.get({ fileId, alt: 'media', ...SHARED_DRIVE_PARAMS }, { responseType: 'arraybuffer' });
    return { buffer: Buffer.from(res.data), name: meta.data.name };
  }

  // Get breadcrumb path from file to user root
  static async getBreadcrumb(fileId, rootFolderId) {
    const crumbs = [];
    let currentId = fileId;

    while (currentId && currentId !== rootFolderId) {
      try {
        const file = await drive.files.get({ fileId: currentId, fields: 'id,name,parents', ...SHARED_DRIVE_PARAMS });
        crumbs.unshift({ id: file.data.id, name: file.data.name });
        currentId = file.data.parents ? file.data.parents[0] : null;
      } catch (e) {
        break;
      }
    }

    return crumbs;
  }
}

module.exports = GoogleDriveService;
