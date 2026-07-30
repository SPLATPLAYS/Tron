// ===================================================================
// STATS / LEADERBOARD (localStorage)
// ===================================================================
const STATS_KEY = 'tron-career-stats-v1';

function loadStats() {
  try { return JSON.parse(localStorage.getItem(STATS_KEY)) || { players: {} }; } catch (e) { return { players: {} }; }
}

function saveStats(s) {
  try { localStorage.setItem(STATS_KEY, JSON.stringify(s)); } catch (e) { /* quota exceeded, ignore */ }
}

function recordMatchResult(playerName, won) {
  const stats = loadStats();
  const key = playerName.toLowerCase();
  if (!stats.players[key]) stats.players[key] = { name: playerName, wins: 0, rounds: 0 };
  stats.players[key].rounds++;
  if (won) stats.players[key].wins++;
  saveStats(stats);
}

function getLeaderboard() {
  const stats = loadStats();
  return Object.values(stats.players)
    .sort((a, b) => b.wins - a.wins || b.rounds - a.rounds || a.name.localeCompare(b.name))
    .slice(0, 20);
}

function clearStats() {
  try { localStorage.removeItem(STATS_KEY); } catch (e) { }
}

function renderStats() {
  const lb = getLeaderboard();
  const tbody = $('statsTable');
  if (!lb.length) {
    tbody.innerHTML = '<tr><td colspan="4" style="color:var(--text-dim);text-align:center;padding:20px;">No stats yet. Play some matches!</td></tr>';
    return;
  }
  tbody.innerHTML = '<thead><tr><th>#</th><th>Player</th><th>Wins</th><th>Rounds</th></tr></thead><tbody>' +
    lb.map((p, i) => '<tr><td>' + (i + 1) + '</td><td class="stats-name">' + escapeHtml(p.name) + '</td><td class="stats-num">' + p.wins + '</td><td class="stats-num">' + p.rounds + '</td></tr>').join('') +
    '</tbody>';
}

// ===================================================================
// REPLAY RECORDER & VIEWER
// ===================================================================
let replayFrames = [];
let replayActive = false;
let replayFrameIdx = 0;
let replayPlaying = false;
let replayTimer = null;

function startReplayRecording() {
  replayFrames = [];
  replayActive = true;
}

function recordReplayFrame(sim) {
  if (!replayActive) return;
  replayFrames.push({
    tick: sim.tick,
    players: sim.players.map(p => ({
      id: p.id, x: p.x, y: p.y, dir: p.dir, alive: p.alive,
      trail: p.trail.map(s => ({ x: s.x, y: s.y, boost: s.boost })),
      boostsLeft: Number.isFinite(p.boostsLeft) ? p.boostsLeft : -1,
    })),
    shrinkTiles: sim.shrinkTiles.size ? Array.from(sim.shrinkTiles) : null,
  });
}

function stopReplayRecording() {
  replayActive = false;
}

function downloadReplay() {
  if (!replayFrames.length) return;
  const settings = currentView && currentView.settings;
  const data = JSON.stringify({
    version: 1,
    settings,
    frames: replayFrames,
    exportedAt: new Date().toISOString()
  });
  const blob = new Blob([data], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'tron-replay-' + Date.now() + '.json';
  a.click();
}

function loadReplayFromFile(file) {
  const reader = new FileReader();
  reader.onload = function() {
    try {
      const data = JSON.parse(reader.result);
      if (!data.frames || !data.frames.length) { alert('Invalid replay file.'); return; }
      startReplayViewer(data);
    } catch (e) { alert('Could not parse replay file.'); }
  };
  reader.readAsText(file);
}

function startReplayViewer(data) {
  if (activeMatch) { activeMatch.stop(); activeMatch = null; }
  destroyActiveControllers();
  currentView = null;
  replayFrames = data.frames;
  replayFrameIdx = 0;
  replayPlaying = false;
  if (replayTimer) clearInterval(replayTimer);
  replayTimer = null;
  var settings = data.settings;
  renderer.configure(settings.cols, settings.rows, sizeForCols(settings.cols));
  renderRoster(data.frames[0].players.map(function(p, i) {
    return { id: p.id, color: PALETTE[i % PALETTE.length], name: 'P' + p.id.replace('p', ''), team: null, infiniteBoost: false };
  }));
  hudCenterText(settings);
  hideOverlay();
  $('replayBar').style.display = 'flex';
  $('replaySlider').max = replayFrames.length - 1;
  $('replaySlider').value = 0;
  renderReplayFrame(0);
  switchScreen('game');
  setGameControlsStrip('REPLAY MODE - drag slider or use buttons to scrub');
}

function renderReplayFrame(idx) {
  if (!replayFrames.length) return;
  var i = Math.max(0, Math.min(idx, replayFrames.length - 1));
  var f = replayFrames[i];
  replayFrameIdx = i;
  $('replaySlider').value = i;
  $('replayLabel').textContent = (i + 1) + ' / ' + replayFrames.length;
  currentView = {
    players: f.players.map(function(p, j) {
      return {
        id: p.id, color: PALETTE[j % PALETTE.length], x: p.x, y: p.y,
        alive: p.alive, trail: p.trail, boosting: false,
        _deadAt: p.alive ? null : performance.now(),
      };
    }),
    shrinkTiles: f.shrinkTiles ? new Set(f.shrinkTiles) : null,
    settings: currentView && currentView.settings,
  };
}

function closeReplay() {
  replayPlaying = false;
  if (replayTimer) clearInterval(replayTimer);
  replayTimer = null;
  replayFrames = [];
  $('replayBar').style.display = 'none';
  currentView = null;
}

// ===================================================================
// CHAT SYSTEM
// ===================================================================
var MAX_CHAT_MSGS = 80;

function addChatMessage(el, name, text, isSystem) {
  if (!el) return;
  var msg = document.createElement('div');
  msg.className = 'chat-msg' + (isSystem ? ' system' : '');
  var nameHtml = name ? '<span class="cname">' + escapeHtml(name) + ':</span> ' : '';
  msg.innerHTML = nameHtml + '<span class="ctext">' + escapeHtml(text) + '</span>';
  el.appendChild(msg);
  while (el.children.length > MAX_CHAT_MSGS) el.firstChild.remove();
  el.scrollTop = el.scrollHeight;
}

function sendChatMessage(text) {
  if (!text || !text.trim()) return;
  text = text.trim();
  if (hostState) {
    var me = hostState.roster.find(function(r) { return r.isHost; });
    var name = me ? me.name : 'Host';
    addChatMessage($('lobbyChatMsgs'), name, text);
    broadcastToAll({ type: 'chat', name: name, text: text });
  } else if (hostConn && hostConn.open) {
    addChatMessage($('lobbyChatMsgs'), 'You', text);
    hostConn.send({ type: 'chat', text: text });
  }
}

function addSystemChat(text) {
  if (hostState) {
    addChatMessage($('lobbyChatMsgs'), 'SYSTEM', text, true);
    broadcastToAll({ type: 'chat', name: 'SYSTEM', text: text, system: true });
  } else if (hostConn && hostConn.open) {
    addChatMessage($('lobbyChatMsgs'), 'SYSTEM', text, true);
  }
}

function clearChat() {
  $('lobbyChatMsgs').innerHTML = '';
}

// ===================================================================
// SPECTATOR MODE
// ===================================================================
var spectatorMode = false;

function guestJoinAsSpectator(code, name) {
  if (!peerAvailable()) { $('joinError').textContent = 'Networking library failed to load -- check your connection.'; return; }
  $('joinError').textContent = '';
  var roomCode = code.trim().toUpperCase();
  guestState = { name: sanitizeName(name), roster: [], ui: null, spectator: true };

  showConnecting('JOINING AS SPECTATOR', [
    { key: 'network', label: 'Connecting to network' },
    { key: 'host', label: 'Reaching host' },
    { key: 'handshake', label: 'Waiting for host to respond' },
  ], roomCode);
  setConnectStep('network', 'active');
  connectCancelFn = function() { switchScreen('joinSetup'); initJoinSetup(); };
  armConnectTimeout(12000, function() {
    connectFail("Couldn't reach the connection network. Check your internet connection and try again.");
  });

  fetchIceServers().then(function(iceServers) {
    peer = new Peer(Object.assign({ debug: 2, config: { iceServers: iceServers } }, DEFAULT_PEER_CONFIG));
    peer.on('open', function() {
      clearConnectTimeout();
      setConnectStep('network', 'done');
      setConnectStep('host', 'active');
      armConnectTimeout(15000, function() {
        connectFail("Couldn't reach the host. They may be offline, or the room code may be wrong.");
      });
      var conn = peer.connect(roomCode, { reliable: true });
      if (!conn) {
        connectFail('Could not connect. Check your network connection and try again.');
        return;
      }
      hostConn = conn;
      conn.on('open', function() {
        clearConnectTimeout();
        setConnectStep('host', 'done');
        setConnectStep('handshake', 'active');
        armConnectTimeout(10000, function() {
          connectFail("Connected, but the host isn't responding. Try again.");
        });
        conn.send({ type: 'spectator', name: guestState.name });
      });
      conn.on('data', function(data) { handleGuestMessage(data); });
      conn.on('close', function() { handleHostDisconnected(); });
      conn.on('error', function() { connectFail('Could not connect. Check the room code.'); });
    });
    peer.on('error', function(err) { connectFail('Connection failed (' + (err && err.type) + ').'); });
    peer.on('disconnected', function() {
      if (guestState && !hostConn) connectFail('Lost connection to the network. Try again.');
    });
  });
}

// ===================================================================
// MATCH STATS TRACKING (integrated with MatchController + online)
// ===================================================================
function recordMatchWinners(roster, score, settings) {
  if (settings.teams) {
    for (var team of ['A', 'B']) {
      var member = roster.find(function(r) { return r.team === team; });
      if (member && score[member.id] >= settings.winScore) {
        roster.filter(function(r) { return r.team === team && !r.isBot; }).forEach(function(r) {
          recordMatchResult(r.name, true);
        });
        var otherTeam = team === 'A' ? 'B' : 'A';
        roster.filter(function(r) { return r.team === otherTeam && !r.isBot; }).forEach(function(r) {
          recordMatchResult(r.name, false);
        });
        break;
      }
    }
  } else {
    var winner = roster.find(function(r) { return score[r.id] >= settings.winScore; });
    roster.filter(function(r) { return !r.isBot; }).forEach(function(r) {
      recordMatchResult(r.name, r === winner);
    });
  }
}
