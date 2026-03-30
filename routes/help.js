const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const HelpController = require('../controllers/helpController');

router.use(authenticate);
router.get('/', HelpController.index);

module.exports = router;
