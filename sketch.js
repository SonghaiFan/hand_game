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
let beatInterval = 800; // ms per beat
let beatCount = 0;

let playerQi = 0;
let aiQi = 0;
let playerAction = "NONE"; // LUCK, ATTACK, DEFENSE
let aiAction = "NONE";
let resultMessage = "";
let winner = ""; // "PLAYER", "AI", or "BOTH"

// Clap detection / Adaptive Rhythm
let clapsFound = 0;
let t1 = 0;
let t2 = 0;
let adaptiveInterval = 800;
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
  clapsFound = 0;
  overlay.classList.add("hidden");
  resultMsg.innerText = "等待拍手开始...";
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

  if (gameState === STATE_BEAT2) {
    let currentTime = millis();
    if (currentTime - t2 > adaptiveInterval) {
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
      gameState = STATE_WAITING;
      clapsFound = 0;
      canClapAgain = true;
    }
  }, adaptiveInterval * 1.5);
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

  clapsFound++;

  if (clapsFound === 1) {
    t1 = millis();
    gameState = STATE_BEAT1;
    playBeatSound(300, 0.1, "triangle");
  } else if (clapsFound === 2) {
    t2 = millis();
    adaptiveInterval = t2 - t1;
    adaptiveInterval = constrain(adaptiveInterval, 400, 1500);
    gameState = STATE_BEAT2;
    playBeatSound(300, 0.1, "triangle");
  }
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
  if (hands.length === 0) return "DEFENSE";

  let handStates = hands.map((h) => getHandState(h));

  if (handStates.includes("GUN")) return "ATTACK";
  if (hands.length === 2 && handStates.every((s) => s === "FIST")) return "LUCK";
  if (hands.length === 2 && handStates.every((s) => s === "OPEN")) return "DEFENSE";

  return "NONE";
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

  if (indexExt && !middleExt && !ringExt && !pinkyExt) return "GUN";
  if (!indexExt && !middleExt && !ringExt && !pinkyExt) return "FIST";
  if (indexExt && middleExt && ringExt && pinkyExt) return "OPEN";

  return "UNKNOWN";
}

function decideAIAction() {
  if (aiQi >= 0.5) {
    let attackChance = 0.3;
    if (playerQi < 0.5) attackChance = 0.6;
    let r = random();
    if (r < attackChance) return "ATTACK";
    if (r < attackChance + 0.25) return "DEFENSE";
    return "LUCK";
  }
  if (playerQi >= 0.5) return random() < 0.4 ? "LUCK" : "DEFENSE";
  return random() < 0.8 ? "LUCK" : "DEFENSE";
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
      if (aiAction === "LUCK") aiHit = true;
      playAttackSound();
    }
    if (aiAttacking) {
      aiQi -= 0.5;
      if (playerAction === "LUCK") playerHit = true;
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

