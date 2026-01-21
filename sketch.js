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

function preload() {
  // ml5 v1 handPose initialization
  // We'll handle flipping manually in the draw loop, so set flipped to false
  handPose = ml5.handPose({ maxHands: 2, flipped: false });
}

function setup() {
  let canvas = createCanvas(640, 480);
  canvas.parent("game-container");

  video = createCapture(VIDEO);
  video.size(640, 480);
  video.hide();

  handPose.detectStart(video, gotHands);

  textAlign(CENTER, CENTER);
  textSize(32);
}

function gotHands(results) {
  hands = results;
}

function draw() {
  background(20);

  // Detect Clap continuously if the game is active
  if (gameStarted && !gameOver) {
    checkPlayerClap();
  }

  // Main Display Area (AI Opponent)
  drawAI();

  // Mini Map / Mirror View (Player) in Bottom Right
  push();
  let miniW = 160;
  let miniH = 120;
  let margin = 20;
  translate(width - miniW - margin, height - miniH - margin);

  // Draw mini background/border
  fill(0);
  stroke(255, 100);
  rect(-2, -2, miniW + 4, miniH + 4);

  // Draw mirrored video
  push();
  translate(miniW, 0);
  scale(-1, 1);
  image(video, 0, 0, miniW, miniH);

  // Draw markers scaled down for mini view
  let scaleFactor = miniW / video.width;
  for (let i = 0; i < hands.length; i++) {
    let hand = hands[i];
    for (let j = 0; j < hand.keypoints.length; j++) {
      let kp = hand.keypoints[j];
      fill(0, 255, 0);
      noStroke();
      circle(kp.x * scaleFactor, kp.y * scaleFactor, 4);
    }
  }
  pop();
  pop();

  // Game logic
  updateGame();

  // HUD
  drawUI();
}

function drawAI() {
  // Simple AI character representation
  push();
  translate(width / 2, height / 2 + 20);

  // Body
  fill(100, 100, 250);
  noStroke();
  rect(-50, 0, 100, 100, 10);

  // Head
  fill(255, 200, 150);
  circle(0, -40, 80);

  // Eyes
  fill(0);
  circle(-15, -45, 10);
  circle(15, -45, 10);

  // AI Animation / Action
  if (
    gameState === STATE_BEAT1 ||
    gameState === STATE_BEAT2 ||
    gameState === STATE_WAITING
  ) {
    // Clapping animation based on clap progress
    let clapFactor = 0;
    if (gameState === STATE_BEAT1) clapFactor = sin((millis() - t1) * 0.01);
    if (gameState === STATE_BEAT2) clapFactor = sin((millis() - t2) * 0.01);

    let clapOffset = map(abs(clapFactor), 0, 1, 0, 40);
    fill(255, 200, 150);
    ellipse(-60 + clapOffset, 40, 30, 45); // Left Hand
    ellipse(60 - clapOffset, 40, 30, 45); // Right Hand
  } else if (
    gameState === STATE_ACTION ||
    (gameState === STATE_RESULT && !gameOver)
  ) {
    drawAIGesture(aiAction);
  } else if (gameOver) {
    // If AI lost/won show reaction
    textSize(40);
    text(aiQi <= 0 && resultMessage.includes("赢") ? "O皿O" : "^_^", 0, -35);
  }
  pop();
}

function drawAIGesture(action) {
  push();
  textSize(60);
  let gestureIcon = "🤔";
  if (action === "LUCK") gestureIcon = "✊✊";
  if (action === "ATTACK") gestureIcon = "👉";
  if (action === "DEFENSE") gestureIcon = "🙅";

  fill(255);
  text(gestureIcon, 0, 80);
  pop();
}

function drawHands() {
  // This is now moved into the mini-view logic in draw()
}

function updateGame() {
  if (!gameStarted) {
    fill(255);
    text("点击屏幕开始游戏", width / 2, height / 2);
    return;
  }

  if (gameOver) {
    return;
  }

  // Adaptive logic: If we've had 2 claps, trigger "Da" after the same interval
  if (gameState === STATE_BEAT2) {
    let currentTime = millis();
    if (currentTime - t2 > adaptiveInterval) {
      triggerAction();
    }
  }
}

function triggerAction() {
  gameState = STATE_ACTION;
  playBeatSound(600, 0.2, "square"); // Sharp Da
  playerAction = detectPlayerAction();
  aiAction = decideAIAction();
  processResult();

  // Reset to waiting after a short delay to show result
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
      canClapAgain = true; // reset only when hands move apart
    }
  }
}

function clapped() {
  playClapSound();
  clapsFound++;

  if (clapsFound === 1) {
    t1 = millis();
    gameState = STATE_BEAT1;
    playBeatSound(300, 0.1, "triangle");
  } else if (clapsFound === 2) {
    t2 = millis();
    adaptiveInterval = t2 - t1; // Remember the pace
    // Clamp interval to reasonable values
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
  // Synthesis of a simple gunshot-like sound
  let noise = new p5.Noise("white");
  let env = new p5.Envelope();
  env.setADSR(0.001, 0.1, 0.1, 0.1);
  env.setRange(0.8, 0);
  noise.start();
  env.play(noise);
  setTimeout(() => noise.stop(), 300);

  // Add a low thump
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
  if (hands.length === 0) return "DEFENSE"; // Default to defense if no hands detected

  let handStates = hands.map((h) => getHandState(h));

  // 1. ATTACK: If any hand looks like a gun, it's an attack (High priority)
  if (handStates.includes("GUN")) {
    return "ATTACK";
  }

  // 2. LUCK: Must have two hands, and both should be fists
  if (hands.length === 2 && handStates.every((s) => s === "FIST")) {
    return "LUCK";
  }

  // 3. DEFENSE: Must have two hands, and both should be open
  if (hands.length === 2 && handStates.every((s) => s === "OPEN")) {
    return "DEFENSE";
  }

  return "NONE";
}

function getHandState(hand) {
  let kp = hand.keypoints;

  // Helper to check if finger is extended
  // Distance from tip to wrist vs mid-joint to wrist
  const isExtended = (tipIdx, jointIdx) => {
    let dTip = dist(kp[tipIdx].x, kp[tipIdx].y, kp[0].x, kp[0].y);
    let dJoint = dist(kp[jointIdx].x, kp[jointIdx].y, kp[0].x, kp[0].y);
    return dTip > dJoint * 1.2;
  };

  let indexExt = isExtended(8, 6);
  let middleExt = isExtended(12, 10);
  let ringExt = isExtended(16, 14);
  let pinkyExt = isExtended(20, 18);

  // Gun: index extended, others curled (vague check for thumb)
  if (indexExt && !middleExt && !ringExt && !pinkyExt) {
    return "GUN";
  }

  // Fist: all four curled
  if (!indexExt && !middleExt && !ringExt && !pinkyExt) {
    return "FIST";
  }

  // Open: all extended
  if (indexExt && middleExt && ringExt && pinkyExt) {
    return "OPEN";
  }

  return "UNKNOWN";
}

function decideAIAction() {
  // Advanced AI Logic

  // 1. Kill Shot: If player has no Qi or just did luck, and AI has Qi, aim to attack
  if (aiQi >= 0.5) {
    // If AI has lots of Qi, be more aggressive
    let attackChance = 0.3;

    // If player is accumulating Qi (just did luck or has low Qi), pressure them
    if (playerQi < 0.5) attackChance = 0.6;

    let r = random();
    if (r < attackChance) return "ATTACK";
    if (r < attackChance + 0.25) return "DEFENSE";
    return "LUCK";
  }

  // 2. Desperation / Build-up
  // If AI has no Qi, it MUST Luck or Defense
  // If player has Qi, AI should Defense more often to avoid being sniped
  if (playerQi >= 0.5) {
    return random() < 0.4 ? "LUCK" : "DEFENSE";
  }

  return random() < 0.8 ? "LUCK" : "DEFENSE";
}

function processResult() {
  let playerHit = false;
  let aiHit = false;

  let playerAttacking = playerAction === "ATTACK" && playerQi >= 0.5;
  let aiAttacking = aiAction === "ATTACK" && aiQi >= 0.5;

  // Resolve Actions
  if (playerAttacking && aiAttacking) {
    // Both attack: cancel each other out
    playerQi -= 0.5;
    aiQi -= 0.5;
    resultMessage = "双方对攻，子弹抵消！";
    playAttackSound();
  } else {
    // Standard resolution
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

  // Bonuses
  if (playerAction === "LUCK") playerQi += 1;
  if (aiAction === "LUCK") aiQi += 1;

  // Messages and Reset
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
    case "LUCK":
      return "集气 (运气)";
    case "ATTACK":
      return "攻击";
    case "DEFENSE":
      return "防御";
    case "NONE":
      return "准备 (无效)";
    default:
      return a;
  }
}

function drawUI() {
  // Draw status bar
  fill(0, 150);
  noStroke();
  rect(0, 0, width, 100);

  fill(255);
  textSize(22);
  textAlign(LEFT);
  text(`玩家 气: ${playerQi.toFixed(1)}`, 20, 35);
  textAlign(RIGHT);
  text(`AI 气: ${aiQi.toFixed(1)}`, width - 20, 35);

  // Current detection preview
  textAlign(CENTER);
  textSize(18);
  fill(200, 255, 200);
  let currentPos = detectPlayerAction();
  text(`预测: ${translateAction(currentPos)}`, width / 2, 90);

  textAlign(CENTER);
  textSize(50);
  if (gameState === STATE_WAITING) {
    fill(255, 200, 0);
    text("请拍手开始...", width / 2, 60);
  } else if (gameState === STATE_BEAT1 || gameState === STATE_BEAT2) {
    fill(255, 200, 0);
    text("咚", width / 2, 60);
  } else if (gameState === STATE_ACTION) {
    fill(255, 0, 0);
    text("哒！", width / 2, 60);
  }

  if (gameState === STATE_RESULT) {
    fill(255, 255, 0);
    textSize(32);
    text(resultMessage, width / 2, height - 80);
    textSize(20);
    text(
      `玩家: ${translateAction(playerAction)}  |  AI: ${translateAction(aiAction)}`,
      width / 2,
      height - 40,
    );
    if (gameOver) {
      push();
      textSize(60);
      stroke(0);
      strokeWeight(4);
      if (winner === "PLAYER") {
        fill(0, 255, 0);
        text("🏆 你赢了！", width / 2, height / 2 - 40);
      } else if (winner === "AI") {
        fill(255, 0, 0);
        text("💀 AI 赢了！", width / 2, height / 2 - 40);
      } else if (winner === "BOTH") {
        fill(255, 255, 0);
        text("🤝 同归于尽！", width / 2, height / 2 - 40);
      }

      fill(255);
      noStroke();
      textSize(24);
      text("点击屏幕重新开始", width / 2, height / 2 + 40);
      pop();
    }
  }
}

function mousePressed() {
  if (!gameStarted) {
    userStartAudio();
    gameStarted = true;
    gameState = STATE_WAITING;
    clapsFound = 0;
  } else if (gameOver) {
    // Reset game
    playerQi = 0;
    aiQi = 0;
    gameOver = false;
    clapsFound = 0;
    canClapAgain = true;
    gameState = STATE_WAITING;
    resultMessage = "新一局开始！";
  }
}
