class HelpController {
  static async index(req, res) {
    const topic = req.query.topic || null;
    res.render('help/index', {
      title: 'Help & Training',
      activeTopic: topic
    });
  }
}

module.exports = HelpController;
