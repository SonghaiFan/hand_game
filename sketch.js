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
let playerQiFill, aiQiFill, resultMsg, beats, overlay, overlayTitle, overlayMsg, startBtn, aiActionIcon, startState;
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
  // No longer using emojis, just managing state for the AI avatar
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
      playReadySound(); // Sound to indicate ready for next clap
    }
  }, adaptiveInterval * 1.5);
}

function playReadySound() {
  let osc = new p5.Oscillator("sine");
  osc.freq(800);
  osc.amp(0.2, 0.05);
  osc.start();
  osc.amp(0, 0.1);
  setTimeout(() => osc.stop(), 150);
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
    playBeatSound(200, 0.15, "triangle"); // Lower "Dong"
  } else if (clapsFound === 2) {
    t2 = millis();
    adaptiveInterval = t2 - t1;
    adaptiveInterval = constrain(adaptiveInterval, 400, 1500);
    gameState = STATE_BEAT2;
    playBeatSound(200, 0.15, "triangle"); // Lower "Dong"
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
  // Sharper pink noise
  let noise = new p5.Noise("pink");
  let env = new p5.Envelope();
  env.setADSR(0.001, 0.03, 0.03, 0.03);
  env.setRange(0.6, 0);
  noise.start();
  env.play(noise);
  setTimeout(() => noise.stop(), 100);

  // Harmonic physical thump
  let osc = new p5.Oscillator("sine");
  osc.freq(150);
  osc.amp(0.4, 0.01);
  osc.start();
  osc.amp(0, 0.1);
  setTimeout(() => osc.stop(), 120);
}

function playHitSound() {
  let noise = new p5.Noise("white");
  let env = new p5.Envelope();
  env.setADSR(0.001, 0.2, 0.1, 0.1);
  env.setRange(0.8, 0);
  noise.start();
  env.play(noise);
  setTimeout(() => noise.stop(), 400);

  let osc = new p5.Oscillator("sawtooth");
  osc.freq(80);
  osc.amp(0.6, 0.05);
  osc.start();
  osc.freq(40, 0.3);
  osc.amp(0, 0.3);
  setTimeout(() => osc.stop(), 400);
}

function playWinSound() {
  let osc = new p5.Oscillator("triangle");
  osc.freq(400);
  osc.amp(0.3, 0.05);
  osc.start();
  osc.freq(600, 0.1);
  osc.freq(800, 0.2);
  osc.amp(0, 0.3);
  setTimeout(() => osc.stop(), 400);
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
    playHitSound();
  } else if (playerHit) {
    resultMessage = "你输了！集气时被击中";
    winner = "AI";
    gameOver = true;
    playHitSound();
  } else if (aiHit) {
    resultMessage = "你赢了！AI 集气时被击中";
    winner = "PLAYER";
    gameOver = true;
    playWinSound();
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

// AIAvatar Instance Mode for a sketchy, hand-drawn character
const aiAvatarSketch = (p) => {
    let w = 300;
    let h = 300;
    
    p.setup = () => {
        let canvas = p.createCanvas(w, h);
        canvas.parent("ai-avatar-container");
    };

    p.draw = () => {
        p.clear();
        p.stroke(0);
        p.noFill();
        
        if (!gameStarted) return;

        // Smooth breathing
        let breath = p.sin(p.frameCount * 0.1) * 3;
        
        p.push();
        p.translate(p.width/2, p.height/2 + 40);
        
        // Body
        p.strokeWeight(3);
        sketchyArc(p, 0, 40, 140, 100, p.PI, p.TWO_PI);
        
        // Head - subtle jump on action
        let headY = -70 + breath;
        if (gameState === STATE_ACTION) headY -= 15;
        
        p.strokeWeight(2.5);
        sketchyEllipse(p, 0, headY, 60, 75);
        
        // Face
        p.strokeWeight(2);
        if (gameState === STATE_RESULT && winner === "AI") {
            sketchyArc(p, -12, headY - 5, 12, 10, p.PI, p.TWO_PI);
            sketchyArc(p, 12, headY - 5, 12, 10, p.PI, p.TWO_PI);
            sketchyArc(p, 0, headY + 15, 20, 15, 0, p.PI);
        } else if (gameState === STATE_RESULT && winner === "PLAYER") {
            sketchyLine(p, -15, headY - 10, -5, headY);
            sketchyLine(p, 15, headY - 10, 5, headY);
            sketchyArc(p, 0, headY + 25, 20, 10, p.PI, p.TWO_PI);
        } else {
            sketchyEllipse(p, -12, headY, 6, 6);
            sketchyEllipse(p, 12, headY, 6, 6);
            sketchyLine(p, -10, headY + 20, 10, headY + 20);
        }

        // Action-specific arms/poses
        p.strokeWeight(3);
        if (aiAction === "LUCK") {
            // "Luck" - Two fists raised
            drawSketchyHand(p, -50, headY + 20, "FIST", -0.5);
            drawSketchyHand(p, 50, headY + 20, "FIST", 0.5);
        } else if (aiAction === "ATTACK") {
            // "Attack" - Gun hand pointing forward
            drawSketchyHand(p, 40, headY + 50, "GUN", 0);
        } else if (aiAction === "DEFENSE") {
            // "Defense" - Arms crossed in front of chest
            p.push();
            p.translate(0, headY + 70);
            sketchyLine(p, -40, -20, 40, 20);
            sketchyLine(p, 40, -20, -40, 20);
            drawSketchyHand(p, -30, -15, "PALM", 0.8);
            drawSketchyHand(p, 30, -15, "PALM", -0.8);
            p.pop();
        } else {
            // IDLE - hands relaxed at sides
            drawSketchyHand(p, -60, headY + 80, "PALM", 0.2);
            drawSketchyHand(p, 60, headY + 80, "PALM", -0.2);
        }
        
        p.pop();
    };

    function drawSketchyHand(p, x, y, type, rotation) {
        p.push();
        p.translate(x, y);
        p.rotate(rotation);
        p.strokeWeight(2);
        
        if (type === "FIST") {
            sketchyEllipse(p, 0, 0, 25, 25);
            // finger lines
            for (let i = -1; i <= 1; i++) {
                sketchyLine(p, i * 4, -8, i * 4, 4);
            }
        } else if (type === "GUN") {
            // Palm/Base
            sketchyEllipse(p, -10, 0, 20, 25);
            // Pointing finger
            sketchyLine(p, 0, -5, 30, -5);
            sketchyLine(p, 0, 0, 25, 0);
            // Thumb
            sketchyLine(p, -10, -10, -10, -20);
        } else if (type === "PALM") {
            sketchyEllipse(p, 0, 0, 22, 28);
            // fingers
            for (let i = -2; i <= 2; i++) {
                sketchyLine(p, i * 3, -12, i * 4, -22);
            }
        }
        p.pop();
    }

    function sketchyLine(p, x1, y1, x2, y2) {
        let steps = 6;
        p.beginShape();
        for(let i=0; i<=steps; i++){
            let x = p.lerp(x1, x2, i/steps);
            let y = p.lerp(y1, y2, i/steps);
            let n = p.noise(x * 0.1, y * 0.1, p.frameCount * 0.05);
            x += (n - 0.5) * 6;
            y += (n - 0.5) * 6;
            p.vertex(x, y);
        }
        p.endShape();
    }

    function sketchyEllipse(p, x, y, w, h) {
        let steps = 12;
        p.beginShape();
        for(let i=0; i<=steps; i++){
            let angle = p.map(i, 0, steps, 0, p.TWO_PI);
            let px = x + p.cos(angle) * w/2;
            let py = y + p.sin(angle) * h/2;
            let n = p.noise(px * 0.1, py * 0.1, p.frameCount * 0.05);
            px += (n - 0.5) * 6;
            py += (n - 0.5) * 6;
            p.vertex(px, py);
        }
        p.endShape(p.CLOSE);
    }

    function sketchyArc(p, x, y, w, h, start, end) {
        let steps = 10;
        p.beginShape();
        for(let i=0; i<=steps; i++){
            let angle = p.map(i, 0, steps, start, end);
            let px = x + p.cos(angle) * w/2;
            let py = y + p.sin(angle) * h/2;
            let n = p.noise(px * 0.1, py * 0.1, p.frameCount * 0.05);
            px += (n - 0.5) * 6;
            py += (n - 0.5) * 6;
            p.vertex(px, py);
        }
        p.endShape();
    }
};

new p5(aiAvatarSketch);
