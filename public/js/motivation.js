// ═══════════════════════════════════════════════════════════
// TaskFlow Motivation System
// Personalized greetings, task celebrations, logout summaries
// ═══════════════════════════════════════════════════════════

(function() {
  // ── MESSAGE POOLS ─────────────────────────────────────────

  var morningGreetings = [
    "Rise and shine, {name}! A new day, a new opportunity.",
    "Good morning, {name}! Ready to make today count?",
    "Hey {name}, fresh start today. Let's make it a great one!",
    "Morning, {name}! Your team is counting on you — let's go!",
    "Good morning, {name}! Small steps lead to big results.",
    "Hey {name}! Coffee's ready, tasks are waiting. Let's do this!",
    "Morning, {name}! Today is yours to own.",
    "Good morning, {name}! Consistency is what makes champions.",
    "Rise up, {name}! Yesterday is gone, today is full of possibilities.",
    "Hey {name}, great things never come from comfort zones. Let's push!"
  ];

  var afternoonGreetings = [
    "Good afternoon, {name}! Keep the momentum going!",
    "Hey {name}, afternoon check-in — you're doing great!",
    "Afternoon, {name}! Halfway through, keep pushing!",
    "Hi {name}! The afternoon hustle is where winners are made.",
    "Good afternoon, {name}! Stay focused, the finish line is closer."
  ];

  var eveningGreetings = [
    "Good evening, {name}! Burning the midnight oil? Respect!",
    "Evening, {name}! Late shift? Your dedication speaks volumes.",
    "Hey {name}, working late shows real commitment. Don't forget to rest!",
    "Good evening, {name}! Night owls get things done.",
    "Hi {name}! Quiet hours, deep focus. Make it count!"
  ];

  var taskCompletionMessages = [
    "Nice work, {name}! One down, keep going!",
    "Boom! Task done. You're on a roll, {name}!",
    "Crushed it! Keep that energy flowing.",
    "Another one bites the dust! Great job, {name}.",
    "Well done! Every completed task is a step forward.",
    "That's how it's done! Onwards and upwards, {name}!",
    "Excellent work! Your consistency is impressive.",
    "Task complete! You make it look easy, {name}.",
    "Checked off! You're building something great today.",
    "Done and dusted! What's next on the list?"
  ];

  var milestoneMessages = {
    3: [
      "3 tasks done already! You're finding your rhythm, {name}.",
      "Hat trick! 3 down — keep this pace going!",
      "Three and counting! Solid progress, {name}."
    ],
    5: [
      "High five! 5 tasks completed — you're a machine, {name}!",
      "5 done! That's what dedication looks like.",
      "Halfway to a perfect day! 5 tasks crushed, {name}!"
    ],
    8: [
      "8 tasks! You're absolutely killing it today, {name}!",
      "Incredible! 8 tasks done — you're unstoppable!",
      "8 and counting! Take a breather, you've earned it."
    ],
    10: [
      "Double digits! 10 tasks — you're a legend, {name}!",
      "10 tasks done! Standing ovation for you, {name}!",
      "Ten! That's a championship performance today."
    ]
  };

  var midShiftMessages = [
    "Keep it up, {name}! You're doing great work today.",
    "Just a reminder — you're awesome, {name}. Keep going!",
    "Halfway through the shift! You've got this.",
    "Your effort today matters. Stay focused, {name}!",
    "Great progress so far! Finish strong, {name}.",
    "Remember why you started. You're closer than you think!",
    "The best is yet to come today, {name}. Stay sharp!",
    "You're making a difference with your work, {name}.",
    "Focus, execute, repeat. You're nailing it!",
    "Hard work pays off, and yours definitely will, {name}."
  ];

  var logoutMessagesGood = [
    "Great day, {name}! {count} tasks completed. You've earned your rest!",
    "What a productive day! {count} tasks done. See you tomorrow, {name}!",
    "You crushed it today — {count} tasks! Rest up and recharge.",
    "{count} tasks completed! That's real progress, {name}. Well done!",
    "Impressive work today, {name}! {count} tasks off the list. Goodnight!"
  ];

  var logoutMessagesAvg = [
    "Good effort today, {name}! {count} tasks done. Tomorrow's a new chance!",
    "Solid day — {count} tasks completed. Rest well, {name}!",
    "You showed up and put in the work — {count} tasks. That counts, {name}!",
    "Every task matters. {count} done today — be proud, {name}!"
  ];

  var logoutMessagesZero = [
    "Wrapping up, {name}? Tomorrow's a fresh start. Rest well!",
    "Take it easy tonight, {name}. Come back stronger tomorrow!",
    "Every day can't be the same. Recharge and hit it hard tomorrow, {name}!",
    "Rest is important too, {name}. See you tomorrow with fresh energy!"
  ];

  var idleNudges = [
    "Hey {name}, taking a breather? Your next task is waiting!",
    "Quick pause? No worries — jump back in when you're ready!",
    "You've been quiet for a bit, {name}. Ready to tackle the next one?",
    "A short break is fine — let's get back on track, {name}!"
  ];

  // ── HELPERS ───────────────────────────────────────────────

  function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function personalize(msg, name, count) {
    return msg.replace(/\{name\}/g, name).replace(/\{count\}/g, count || 0);
  }

  function getFirstName() {
    var el = document.querySelector('.user-info .user-name, .sidebar-footer .user-name');
    if (el) {
      return el.textContent.trim().split(' ')[0];
    }
    // Fallback: try from the page
    var userNameEl = document.querySelector('[data-user-name]');
    if (userNameEl) return userNameEl.dataset.userName.split(' ')[0];
    return 'there';
  }

  function getTimeOfDay() {
    var hour = new Date().getHours();
    if (hour < 12) return 'morning';
    if (hour < 17) return 'afternoon';
    return 'evening';
  }

  function showMotivationToast(message, icon, duration) {
    if (typeof showToast === 'function') {
      showToast(message, 'info', duration || 8000);
    }
  }

  // ── 1. LOGIN GREETING ─────────────────────────────────────

  function showLoginGreeting() {
    var loginAt = localStorage.getItem('tf_login_at');
    var greetingShown = sessionStorage.getItem('tf_greeting_shown');

    if (!loginAt || greetingShown) return;

    // Only show within 30 seconds of login
    var elapsed = Date.now() - parseInt(loginAt);
    if (elapsed > 30000) return;

    sessionStorage.setItem('tf_greeting_shown', '1');
    localStorage.removeItem('tf_login_at');

    var name = getFirstName();
    var tod = getTimeOfDay();
    var pool = tod === 'morning' ? morningGreetings : tod === 'afternoon' ? afternoonGreetings : eveningGreetings;
    var msg = personalize(pickRandom(pool), name);

    // Delay slightly so the page loads first
    setTimeout(function() {
      showMotivationToast(msg, 'bi-stars', 6000);
    }, 1500);
  }

  // ── 2. TASK COMPLETION CELEBRATION ────────────────────────

  function getCompletedToday() {
    var count = parseInt(sessionStorage.getItem('tf_completed_today') || '0');
    return count;
  }

  function incrementCompleted() {
    var count = getCompletedToday() + 1;
    sessionStorage.setItem('tf_completed_today', count.toString());
    return count;
  }

  function celebrateTaskCompletion() {
    var count = incrementCompleted();
    var name = getFirstName();

    // Check for milestones first
    if (milestoneMessages[count]) {
      var milestoneMsg = personalize(pickRandom(milestoneMessages[count]), name);
      setTimeout(function() {
        showMotivationToast(milestoneMsg, 'bi-trophy', 7000);
      }, 1500);
      return;
    }

    // Regular completion message (show for every 1st, 2nd, then every other)
    if (count <= 2 || count % 2 === 0) {
      var msg = personalize(pickRandom(taskCompletionMessages), name, count);
      setTimeout(function() {
        showMotivationToast(msg, 'bi-check-circle', 5000);
      }, 1500);
    }
  }

  // ── 3. MID-SHIFT MOTIVATION ───────────────────────────────

  function scheduleMidShiftMotivation() {
    // Show a motivational message every 90 minutes
    var interval = 90 * 60 * 1000;
    var lastShown = parseInt(sessionStorage.getItem('tf_midshift_at') || '0');
    var now = Date.now();

    if (now - lastShown < interval) return;

    // Schedule for 90 mins from now (or sooner if overdue)
    var delay = Math.max(interval - (now - lastShown), 60000); // at least 1 min

    setTimeout(function() {
      var name = getFirstName();
      var msg = personalize(pickRandom(midShiftMessages), name);
      showMotivationToast(msg, 'bi-lightning-charge', 6000);
      sessionStorage.setItem('tf_midshift_at', Date.now().toString());
      // Schedule next
      scheduleMidShiftMotivation();
    }, delay);
  }

  // ── 4. LOGOUT SUMMARY ────────────────────────────────────

  function showLogoutSummary(callback) {
    var name = getFirstName();

    // Fetch today's task stats
    fetch('/my-progress?_ajax=1')
      .then(function(r) { return r.text(); })
      .catch(function() { return ''; })
      .then(function() {
        // Use the session counter as a quick fallback
        var completed = getCompletedToday();
        var msg;

        if (completed >= 5) {
          msg = personalize(pickRandom(logoutMessagesGood), name, completed);
        } else if (completed > 0) {
          msg = personalize(pickRandom(logoutMessagesAvg), name, completed);
        } else {
          msg = personalize(pickRandom(logoutMessagesZero), name);
        }

        // Show in a nice modal
        showLogoutModal(msg, completed, callback);
      });
  }

  function showLogoutModal(message, count, callback) {
    // Create overlay
    var overlay = document.createElement('div');
    overlay.id = 'motivationLogoutOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9999;display:flex;align-items:center;justify-content:center;padding:1rem;animation:fadeIn 0.3s ease;';

    var emoji = count >= 5 ? '🏆' : count > 0 ? '👏' : '🌙';
    var subtext = count >= 5 ? 'Outstanding performance!' : count > 0 ? 'Every task counts!' : 'Tomorrow is a new day!';

    overlay.innerHTML =
      '<div style="background:var(--tf-surface);border:1px solid var(--tf-border);border-radius:20px;padding:2.5rem;width:100%;max-width:420px;text-align:center;animation:scaleIn 0.3s ease;">' +
        '<div style="font-size:3rem;margin-bottom:1rem;">' + emoji + '</div>' +
        '<p style="font-size:1rem;font-weight:600;margin-bottom:0.5rem;color:var(--tf-text);">' + message + '</p>' +
        '<p style="font-size:0.8rem;color:var(--tf-text-muted);margin-bottom:1.5rem;">' + subtext + '</p>' +
        (count > 0 ? '<div style="display:flex;justify-content:center;gap:1rem;margin-bottom:1.5rem;">' +
          '<div style="text-align:center;"><div style="font-size:1.5rem;font-weight:700;color:var(--tf-success);">' + count + '</div><div style="font-size:0.65rem;color:var(--tf-text-muted);text-transform:uppercase;letter-spacing:1px;">Completed</div></div>' +
        '</div>' : '') +
        '<button onclick="document.getElementById(\'motivationLogoutOverlay\').remove();' + (callback ? 'window._logoutCallback();' : '') + '" ' +
          'style="background:linear-gradient(135deg,var(--tf-accent),#7c3aed);border:none;color:#fff;padding:10px 28px;border-radius:10px;font-weight:600;font-size:0.85rem;cursor:pointer;">' +
          'Goodnight! 👋' +
        '</button>' +
      '</div>';

    document.body.appendChild(overlay);
  }

  // ── INTERCEPT LOGOUT ──────────────────────────────────────

  function interceptLogout() {
    // Override the handleLogout function to show summary first
    if (typeof window.handleLogout === 'function') {
      var originalHandleLogout = window.handleLogout;

      window.handleLogout = function() {
        var role = document.querySelector('[data-user-role]');
        var roleName = role ? role.dataset.userRole : '';

        // Only show for LOCAL users (not admins, not client)
        if (roleName.startsWith('CLIENT_') || roleName === 'LOCAL_ADMIN') {
          originalHandleLogout();
          return;
        }

        // Show summary, then proceed with original logout
        window._logoutCallback = function() {
          originalHandleLogout();
        };
        showLogoutSummary(true);
      };
    }
  }

  // ── INTERCEPT TASK COMPLETION ─────────────────────────────

  function interceptTaskCompletion() {
    // Hook into showToast to detect task completions
    if (typeof window.showToast === 'function') {
      var originalShowToast = window.showToast;
      window.showToast = function(message, type, duration) {
        originalShowToast(message, type, duration);

        // Detect task completion messages
        if (type !== 'error' && message && (
          message.toLowerCase().includes('task completed') ||
          message.toLowerCase().includes('task marked as completed') ||
          message.toLowerCase().includes('marked complete')
        )) {
          celebrateTaskCompletion();
        }
      };
    }
  }

  // ── INITIALIZE ────────────────────────────────────────────

  function init() {
    // Only for LOCAL team users (not client portal, not login page)
    var body = document.body;
    if (!body || window.location.pathname.startsWith('/portal') || window.location.pathname.startsWith('/auth')) return;

    // Wait for DOM
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', run);
    } else {
      run();
    }

    function run() {
      showLoginGreeting();
      interceptTaskCompletion();
      scheduleMidShiftMotivation();

      // Delay intercepting logout to ensure handleLogout is defined
      setTimeout(interceptLogout, 2000);
    }
  }

  init();
})();
