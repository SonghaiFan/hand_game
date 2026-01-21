let handPose;
let video;
let hands = [];
let gameStarted = false;
let gameOver = false;

// Game state constants
const STATE_WAITING = "WAITING";
const STATE_BEAT1 = "BEAT1"; // Dong
const STATE_BEAT2 = "BEAT2"; // Dong
const STATE_ACTION = "ACTION"; // Da
const STATE_RESULT = "RESULT";

let gameState = STATE_WAITING;
let lastBeatTime = 0;
let beatInterval = 400; // ms per beat
let beatCount = 0;

let playerQi = 0;
let aiQi = 0;
let playerAction = "NONE"; // LUCK, ATTACK, DEFENSE
let aiAction = "NONE";
let resultMessage = "";
let winner = ""; // "PLAYER", "AI", or "BOTH"

// Clap detection
let clapThreshold = 100;
let canClapAgain = true; // prevent multiple triggers per clap

// DOM Elements
let playerQiFill, aiQiFill, resultMsg, beats, overlay, overlayTitle, overlayMsg, startBtn, startState, aiImg;
let modelReady = false;

function preload() {
  handPose = ml5.handPose({ maxHands: 2, flipped: false });
}

function setup() {
  const container = document.getElementById("game-container");
  
  let canvas = createCanvas(640, 480);
  canvas.parent("game-container");

  video = createCapture(VIDEO);
  video.size(640, 480);
  video.hide();

  handPose.detectStart(video, gotHands);

  // Initialize DOM references
  playerQiFill = document.getElementById("player-qi-fill");
  aiQiFill = document.getElementById("ai-qi-fill");
  resultMsg = document.getElementById("result-message");
  beats = [
    document.getElementById("beat1"),
    document.getElementById("beat2"),
    document.getElementById("beat3")
  ];
  overlay = document.getElementById("overlay");
  overlayTitle = document.getElementById("overlay-title");
  overlayMsg = document.getElementById("overlay-msg");
  startBtn = document.getElementById("start-btn");
  startState = document.getElementById("start-state");
  aiImg = document.getElementById("ai-img");

  startBtn.addEventListener("click", () => {
    userStartAudio();
    startGame();
  });

  textAlign(CENTER, CENTER);
  textSize(32);
}

function startGame() {
  gameStarted = true;
  gameOver = false;
  playerQi = 0;
  aiQi = 0;
  gameState = STATE_WAITING;
  gameState = STATE_WAITING;
  overlay.classList.add("hidden");
  resultMsg.innerText = "拍手开始回合 / Clap to Start Round";
  updateUIDOM();
}

function gotHands(results) {
  hands = results;
  // Once we get any results, enable the start button
  if (!modelReady) {
    modelReady = true;
    startBtn.disabled = false;
    startBtn.innerText = "点击开始 / START";
  }
}

function draw() {
  background(0);

  if (gameStarted) {
    checkPlayerClap();
  }

  // Draw mirrored video and hand markers
  push();
  translate(width, 0);
  scale(-1, 1);
  image(video, 0, 0, width, height);

  for (let i = 0; i < hands.length; i++) {
    let hand = hands[i];
    for (let j = 0; j < hand.keypoints.length; j++) {
      let kp = hand.keypoints[j];
      fill(0, 255, 0);
      noStroke();
      circle(kp.x, kp.y, 8);
    }
  }
  pop();

  updateGame();
  updateUIDOM();
}

function updateAIActionDOM(action) {
  if (!aiImg) return;
  
  if (action === "LUCK") aiImg.src = "image/LUCK.png";
  else if (action === "ATTACK") aiImg.src = "image/ATTACK.png";
  else if (action === "DEFENSE") aiImg.src = "image/DEFENSE.png";
  else aiImg.src = "image/NORMAL.png";
}

function updateGame() {
  if (!gameStarted || gameOver) return;

  let currentTime = millis();

  if (gameState === STATE_BEAT1) {
    if (currentTime - lastBeatTime > beatInterval) {
      gameState = STATE_BEAT2;
      lastBeatTime = currentTime;
      playBeatSound(300, 0.1, "triangle");
    }
  } else if (gameState === STATE_BEAT2) {
    if (currentTime - lastBeatTime > beatInterval) {
      triggerAction();
    }
  }
}

function triggerAction() {
  gameState = STATE_ACTION;
  playBeatSound(600, 0.2, "square");
  playerAction = detectPlayerAction();
  aiAction = decideAIAction();
  processResult();

  setTimeout(() => {
    if (!gameOver) {
      startRound();
    }
  }, beatInterval * 2);
}

function checkPlayerClap() {
  if (hands.length === 2) {
    let d = dist(
      hands[0].keypoints[0].x,
      hands[0].keypoints[0].y,
      hands[1].keypoints[0].x,
      hands[1].keypoints[0].y,
    );

    if (d < clapThreshold && canClapAgain) {
      clapped();
      canClapAgain = false;
    } else if (d > clapThreshold + 50) {
      canClapAgain = true;
    }
  }
}

function clapped() {
  playClapSound();

  if (gameOver) {
    startGame();
    return;
  }

  if (gameState === STATE_WAITING) {
    startRound();
  }
}

function startRound() {
  gameState = STATE_BEAT1;
  lastBeatTime = millis();
  playBeatSound(300, 0.1, "triangle");
}

function playBeatSound(freq, duration, type) {
  let osc = new p5.Oscillator(type);
  osc.freq(freq);
  osc.amp(0.3, 0.05);
  osc.start();
  osc.amp(0, duration);
  setTimeout(() => osc.stop(), duration * 1000 + 100);
}

function playAttackSound() {
  let noise = new p5.Noise("white");
  let env = new p5.Envelope();
  env.setADSR(0.001, 0.1, 0.1, 0.1);
  env.setRange(0.8, 0);
  noise.start();
  env.play(noise);
  setTimeout(() => noise.stop(), 300);

  let osc = new p5.Oscillator("sine");
  osc.freq(100);
  osc.amp(0.5, 0.05);
  osc.start();
  osc.freq(40, 0.2);
  osc.amp(0, 0.2);
  setTimeout(() => osc.stop(), 200);
}

function playClapSound() {
  let noise = new p5.Noise("brown");
  let env = new p5.Envelope();
  env.setADSR(0.001, 0.05, 0.05, 0.05);
  env.setRange(0.4, 0);
  noise.start();
  env.play(noise);
  setTimeout(() => noise.stop(), 150);
}

function detectPlayerAction() {
  // 1. Safety Fallback: No hands visible -> assume Defense (blocking/hiding)
  if (hands.length === 0) return "DEFENSE";

  // 2. Classify each hand
  let handStates = hands.map((h) => getHandState(h));

  // 3. Priority Hierarchy
  // Rule A: ONE Gun is enough to Attack.
  if (handStates.includes("GUN")) return "ATTACK";

  // Rule B: Fists indicate Charging (Luck). 
  // strict-ish: need more Fists than Opens (e.g. 2 Fists, or 1 Fist if 1 hand).
  // If 1 Fist + 1 Open, treating as Defense is safer for the player.
  let fistCount = handStates.filter(s => s === "FIST").length;
  let openCount = handStates.filter(s => s === "OPEN").length;

  if (fistCount > openCount) return "LUCK";

  // Rule C: Default to Defense (Open hands, mixed signals, or protective gestures)
  return "DEFENSE";
}

function getHandState(hand) {
  let kp = hand.keypoints;
  const isExtended = (tipIdx, jointIdx) => {
    let dTip = dist(kp[tipIdx].x, kp[tipIdx].y, kp[0].x, kp[0].y);
    let dJoint = dist(kp[jointIdx].x, kp[jointIdx].y, kp[0].x, kp[0].y);
    return dTip > dJoint * 1.2;
  };

  let indexExt = isExtended(8, 6);
  let middleExt = isExtended(12, 10);
  let ringExt = isExtended(16, 14);
  let pinkyExt = isExtended(20, 18);

  // Count extended non-thumb fingers
  let extCount = (indexExt ? 1 : 0) + (middleExt ? 1 : 0) + (ringExt ? 1 : 0) + (pinkyExt ? 1 : 0);

  // Fuzzy Classification
  
  // 1. GUN: Index must be extended. Others mostly closed.
  if (indexExt) {
    if (extCount <= 2) return "GUN"; // Allows index + 1 other (sloppy gun)
    return "OPEN"; // Index + 2 others -> too many for gun, probably open
  }

  // 2. FIST: Index closed. Total extended low.
  if (extCount <= 1) return "FIST"; // Allows 1 stray finger (non-index)

  // 3. OPEN: Everything else.
  return "OPEN";
}

function decideAIAction() {
  // Case 1: Both Low Energy -> Rush to charge (Safe)
  if (aiQi < 0.5 && playerQi < 0.5) {
    return "LUCK"; 
  }

  // Case 2: AI Advantage (Predator) -> Player is scared
  if (aiQi >= 0.5 && playerQi < 0.5) {
    // User request: "As long as can shoot, don't rush Luck"
    // Press the advantage effectively.
    // 80% Attack (Suppress), 20% Luck (Greed only occasionally)
    return random() < 0.8 ? "ATTACK" : "LUCK";
  }

  // Case 3: AI Disadvantage (Survivor) -> Player is threat
  if (aiQi < 0.5 && playerQi >= 0.5) {
    // High risk. Must defend.
    return random() < 0.9 ? "DEFENSE" : "LUCK"; 
  }

  // Case 4: High Stakes Standoff (Both Armed)
  if (aiQi >= 0.5 && playerQi >= 0.5) {
    // User request: Don't rush Luck.
    // High aggression and safety. Very low greed.
    let r = random();
    if (r < 0.50) return "ATTACK";  // 50% Aggression
    if (r < 0.95) return "DEFENSE"; // 45% Safety
    return "LUCK";                  // 5% Risky Greed
  }

  return "LUCK";
}

function processResult() {
  let playerHit = false;
  let aiHit = false;
  let playerAttacking = playerAction === "ATTACK" && playerQi >= 0.5;
  let aiAttacking = aiAction === "ATTACK" && aiQi >= 0.5;

  if (playerAttacking && aiAttacking) {
    playerQi -= 0.5;
    aiQi -= 0.5;
    resultMessage = "双方对攻，子弹抵消！";
    playAttackSound();
  } else {
    if (playerAttacking) {
      playerQi -= 0.5;
      // Hit anything that isn't DEFENSE (since we know they aren't counter-attacking here)
      if (aiAction !== "DEFENSE") aiHit = true;
      playAttackSound();
    }
    if (aiAttacking) {
      aiQi -= 0.5;
      // Hit anything that isn't DEFENSE
      if (playerAction !== "DEFENSE") playerHit = true;
      playAttackSound();
    }
  }

  if (playerAction === "LUCK") playerQi += 1;
  if (aiAction === "LUCK") aiQi += 1;

  if (playerHit && aiHit) {
    resultMessage = "同归于尽！双方在集气时被击中";
    winner = "BOTH";
    gameOver = true;
  } else if (playerHit) {
    resultMessage = "你输了！集气时被击中";
    winner = "AI";
    gameOver = true;
  } else if (aiHit) {
    resultMessage = "你赢了！AI 集气时被击中";
    winner = "PLAYER";
    gameOver = true;
  } else {
    resultMessage = `${translateAction(playerAction)} vs ${translateAction(aiAction)}`;
  }
}

function translateAction(a) {
  switch (a) {
    case "LUCK": return "集气 (运气)";
    case "ATTACK": return "攻击";
    case "DEFENSE": return "防御";
    case "NONE": return "准备 (无效)";
    default: return a;
  }
}

function updateUIDOM() {
  if (!gameStarted) return;
  playerQiFill.style.width = `${constrain(playerQi * 20, 0, 100)}%`;
  aiQiFill.style.width = `${constrain(aiQi * 20, 0, 100)}%`;
  beats.forEach(b => b.classList.remove('active'));
  if (gameState === STATE_BEAT1) beats[0].classList.add('active');
  if (gameState === STATE_BEAT2) beats[1].classList.add('active');
  if (gameState === STATE_ACTION) beats[2].classList.add('active');

  if (gameState === STATE_WAITING) {
    let prediction = detectPlayerAction();
    resultMsg.innerText = `预测: ${translateAction(prediction)} | 准备拍手...`;
    resultMsg.style.color = "var(--ink)";
    updateAIActionDOM("NONE");
  } else if (gameState === STATE_ACTION || gameState === STATE_RESULT) {
    resultMsg.innerText = resultMessage;
    resultMsg.style.color = "var(--accent-bleed)";
    updateAIActionDOM(aiAction);
  } else {
    updateAIActionDOM("NONE");
  }

  if (gameOver) {
    overlay.classList.remove("hidden");
    overlayTitle.innerHTML = winner === "PLAYER" ? "🏆 你赢了！" : (winner === "AI" ? "💀 AI 赢了！" : "🤝 同归于尽！");
    overlayMsg.innerHTML = `${resultMessage}<br><br><span style="font-size: 0.9em; opacity: 0.8;">拍手或点击按钮重新开始 (Clap to restart)</span>`;
    startBtn.innerText = "重新开始 / RESTART";
  }
}

function mousePressed() {
  if (gameOver) startGame();
}

// Subtle parallax/tilt effect
document.addEventListener('mousemove', (e) => {
    const x = (e.clientX / window.innerWidth - 0.5) * 10;
    const y = (e.clientY / window.innerHeight - 0.5) * 10;
    const stage = document.querySelector('.game-stage');
    if (stage) stage.style.transform = `rotateY(${x}deg) rotateX(${-y}deg)`;
});

