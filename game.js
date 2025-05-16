const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const gameContainer = document.getElementById('game-container');

// --- DOM Elements ---
const currentScoreEl = document.getElementById('current-score');
const highScoreEl = document.getElementById('high-score');
const finalScoreEl = document.getElementById('final-score');
const statusIndicatorEl = document.getElementById('status-indicator');

const startOverlay = document.getElementById('start-overlay');
const pauseOverlay = document.getElementById('pause-overlay');
const gameoverOverlay = document.getElementById('gameover-overlay');

const startButton = document.getElementById('startButton');
const restartButton = document.getElementById('restartButton');

// --- Game Constants ---
const GRID_SIZE = 20; // Size of each snake segment and grid square
const CANVAS_WIDTH = canvas.width;
const CANVAS_HEIGHT = canvas.height;
const TILE_COUNT_X = CANVAS_WIDTH / GRID_SIZE;
const TILE_COUNT_Y = CANVAS_HEIGHT / GRID_SIZE;

const INITIAL_SPEED = 150; // Milliseconds per game tick (lower is faster)
const SPEED_INCREMENT_THRESHOLD = 50; // Increase speed every 50 points
const MIN_SPEED = 60; // Maximum speed cap

const OBSTACLE_COUNT = 5; // Number of obstacles

// --- Game State Variables ---
let gameState = 'ready'; // 'ready', 'playing', 'paused', 'gameOver'
let snake, food, obstacles;
let direction, nextDirection;
let score, highScore;
let gameLoopInterval;
let currentSpeed;

// Power-up states
let ghostModeActive = false;
let speedBoostActive = false;
let slowDownActive = false;
let powerUpTimer = 0;
const POWERUP_DURATION = 8000; // 8 seconds in milliseconds

// --- Colors and Styles ---
// Gradients need to be created on the fly during drawing if used as fillStyle
// const SNAKE_COLOR = 'linear-gradient(180deg, #4CAF50, #388E3C)'; // Can't use directly
// const GHOST_SNAKE_COLOR = 'linear-gradient(180deg, #80DEEA, #4DD0E1)'; // Can't use directly
const SNAKE_HEAD_COLOR = '#81C784'; // Lighter green for head
const GHOST_HEAD_COLOR = '#B2EBF2';
const FOOD_COLORS = {
    standard: '#FF3B30', // Red Apple
    bonus: '#FFCC00',    // Gold Star
    ghost: '#87CEFA',    // Light Blue Diamond
    slow: '#00FFFF'     // Cyan Snowflake
};
const OBSTACLE_COLOR = '#cc66ff'; // Purple for obstacles
const GRID_COLOR = '#2a2a30'; // Dark grid lines

// --- Initialization ---
function loadHighScore() {
    // Use try-catch for potential localStorage access issues in some contexts
    try {
      highScore = parseInt(localStorage.getItem('snakeHighScoreDeluxe')) || 0;
    } catch (e) {
      console.warn("Could not access localStorage for high score:", e);
      highScore = 0;
    }
    highScoreEl.textContent = highScore;
}

function saveHighScore() {
    if (score > highScore) {
        highScore = score;
        try {
          localStorage.setItem('snakeHighScoreDeluxe', highScore);
        } catch (e) {
          console.warn("Could not save high score to localStorage:", e);
        }
        highScoreEl.textContent = highScore;
    }
}

function resetGame() {
    // Reset snake
    const startX = Math.floor(TILE_COUNT_X / 2);
    const startY = Math.floor(TILE_COUNT_Y / 2);
    snake = [
        { x: startX, y: startY },
        { x: startX - 1, y: startY },
        { x: startX - 2, y: startY }
    ];
    direction = 'right';
    nextDirection = 'right';

    // Reset score and speed
    score = 0;
    currentScoreEl.textContent = score;
    currentSpeed = INITIAL_SPEED;

    // Reset power-ups
    resetPowerUps();

    // Place initial elements - ensure obstacles are placed *before* food
    obstacles = placeObstacles(); // Place obstacles based on initial snake pos
    food = placeFood(); // Ensure food isn't on snake or obstacles

    // Reset UI
    startOverlay.classList.remove('visible');
    pauseOverlay.classList.remove('visible');
    gameoverOverlay.classList.remove('visible');
    statusIndicatorEl.classList.remove('visible');

    console.log("Game Reset");
    // Ensure canvas has focus when game resets/starts in popup
    canvas.focus();
}

function init() {
    loadHighScore();
    showOverlay('start');
    // Draw initial empty grid or placeholder state if needed before start
     drawGrid(); // Draw grid even when ready
     // Scores are handled by UI elements, no separate drawUI needed
    console.log("Game Initialized");
}

// --- Game Loop ---
function startGameLoop() {
    if (gameLoopInterval) clearInterval(gameLoopInterval); // Clear existing loop if any
    gameLoopInterval = setInterval(gameLoop, currentSpeed);
    console.log(`Game Loop Started - Speed: ${currentSpeed}ms`);
}

function gameLoop() {
    // Double check state as interval might fire once after state change
    if (gameState !== 'playing') return;

    update();
    draw(); // Draw elements
    updatePowerUpTimers();
}

// --- Updates ---
function update() {
    if (gameState !== 'playing') return;

    // Update direction based on buffered input
    direction = nextDirection;

    moveSnake();
    checkCollisions();
}

function moveSnake() {
    const head = { ...snake[0] }; // Copy head

    // Calculate new head position based on direction
    switch (direction) {
        case 'up': head.y--; break;
        case 'down': head.y++; break;
        case 'left': head.x--; break;
        case 'right': head.x++; break;
    }

    // Wall Wrapping / Ghost Mode Handling
    if (ghostModeActive) {
        if (head.x < 0) head.x = TILE_COUNT_X - 1;
        else if (head.x >= TILE_COUNT_X) head.x = 0;
        if (head.y < 0) head.y = TILE_COUNT_Y - 1;
        else if (head.y >= TILE_COUNT_Y) head.y = 0;
    }

    // Add new head
    snake.unshift(head);

    // Check for food collision BEFORE maybe popping the tail
    if (head.x === food.x && head.y === food.y) {
         handleFoodConsumption();
         // NOTE: Tail is NOT popped when food is eaten (except for specific powerups)
    } else {
        // Remove tail if no food eaten
        snake.pop();
    }
}

function handleFoodConsumption() {
     let grows = true; // Most food makes snake grow
     // Score and effects based on food type
     switch (food.type) {
         case 'standard':
             score += 10;
             break;
         case 'bonus':
             score += 50;
             activatePowerUp('speedBoost');
             break;
         case 'ghost':
             score += 20;
             activatePowerUp('ghost');
             grows = false; // Ghost food doesn't grow snake
             break;
         case 'slow':
             score += 5;
             activatePowerUp('slowDown');
             grows = false; // Slow food doesn't grow snake
             break;
     }

     currentScoreEl.textContent = score;
     updateGameSpeed(); // Update speed based on score and active powerups
     food = placeFood(); // Place new food
     console.log(`Ate ${food.type}. Score: ${score}`);

     // Pop tail only if the food type dictates non-growth
     if (!grows && snake.length > 1) { // Ensure snake doesn't disappear
         // This pop was previously missing for ghost/slow after adding head
         snake.pop();
     }
}

 function updateGameSpeed() {
     // Calculate base speed reduction based on score
     let speedChange = Math.floor(score / SPEED_INCREMENT_THRESHOLD) * 10; // Decrease interval by 10ms per threshold
     let baseSpeed = INITIAL_SPEED - speedChange;

     // Apply power-up modifiers
     if (speedBoostActive) {
         baseSpeed = baseSpeed * 0.7; // 30% faster (smaller interval)
     } else if (slowDownActive) {
         baseSpeed = baseSpeed * 1.4; // 40% slower (larger interval)
     }

     // Ensure speed doesn't go below min or become excessively high
     currentSpeed = Math.round(Math.max(MIN_SPEED, baseSpeed));

     // Restart interval with new speed ONLY if it changed and game is playing
     if (gameState === 'playing') {
         clearInterval(gameLoopInterval);
         gameLoopInterval = setInterval(gameLoop, currentSpeed);
         // console.log(`Speed updated to: ${currentSpeed}ms`);
     }
 }

function checkCollisions() {
    if (gameState !== 'playing') return; // Don't check collisions if not playing

    const head = snake[0];

    // 1. Wall Collision (ignored if ghost mode is active)
    if (!ghostModeActive && (head.x < 0 || head.x >= TILE_COUNT_X || head.y < 0 || head.y >= TILE_COUNT_Y)) {
        console.log("Collision: Wall");
        gameOver();
        return;
    }

    // 2. Self Collision (ignored if ghost mode is active)
     if (!ghostModeActive) {
         for (let i = 1; i < snake.length; i++) {
             if (head.x === snake[i].x && head.y === snake[i].y) {
                 console.log("Collision: Self");
                 gameOver();
                 return;
             }
         }
     }

    // 3. Obstacle Collision (ignored if ghost mode is active)
     if (!ghostModeActive && obstacles) { // Check obstacles exist
         for (const obs of obstacles) {
             if (head.x === obs.x && head.y === obs.y) {
                 console.log("Collision: Obstacle");
                 gameOver();
                 return;
             }
         }
     }
}

// --- Drawing ---
function draw() {
    if (!ctx || gameState === 'ready') return; // Don't draw if context missing or game not started

    // Clear canvas
    ctx.fillStyle = '#0f0f10'; // Background color
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    drawGrid();
    if (obstacles) drawObstacles(); // Draw obstacles if they exist
    if (snake) drawSnake();       // Draw snake if it exists
    if (food) drawFood();         // Draw food if it exists
}

 function drawGrid() {
     ctx.strokeStyle = GRID_COLOR;
     ctx.lineWidth = 0.5; // Thin lines
     for (let x = 0; x <= CANVAS_WIDTH; x += GRID_SIZE) {
         ctx.beginPath();
         ctx.moveTo(x, 0);
         ctx.lineTo(x, CANVAS_HEIGHT);
         ctx.stroke();
     }
     for (let y = 0; y <= CANVAS_HEIGHT; y += GRID_SIZE) {
         ctx.beginPath();
         ctx.moveTo(0, y);
         ctx.lineTo(CANVAS_WIDTH, y);
         ctx.stroke();
     }
 }

function drawSnake() {
    const isGhost = ghostModeActive;

    // Create gradients dynamically
    const bodyGradient = ctx.createLinearGradient(0, 0, 0, GRID_SIZE);
    if (isGhost) {
        bodyGradient.addColorStop(0, '#80DEEA'); // Light cyan
        bodyGradient.addColorStop(1, '#4DD0E1'); // Darker cyan
    } else {
        bodyGradient.addColorStop(0, '#4CAF50'); // Light green
        bodyGradient.addColorStop(1, '#388E3C'); // Dark green
    }

    snake.forEach((segment, index) => {
        const x = segment.x * GRID_SIZE;
        const y = segment.y * GRID_SIZE;
        const size = GRID_SIZE;
        const cornerRadius = size * 0.3; // Rounded corners

         // Use roundRect if available (modern browsers)
         const useRoundRect = typeof ctx.roundRect === 'function';

         if (index === 0) { // Head
             ctx.fillStyle = isGhost ? GHOST_HEAD_COLOR : SNAKE_HEAD_COLOR;
             ctx.beginPath();
             if (useRoundRect) {
                 ctx.roundRect(x + 1, y + 1, size - 2, size - 2, cornerRadius);
             } else { // Fallback for older browsers
                 ctx.rect(x + 1, y + 1, size - 2, size - 2);
             }
             ctx.fill();

             // Eyes (simple dots)
             ctx.fillStyle = '#111'; // Darker eyes
             let eye1X, eye1Y, eye2X, eye2Y;
             const eyeSize = Math.max(1, size * 0.1); // Ensure eyeSize is at least 1
             const eyeOffsetX = size * 0.25;
             const eyeOffsetY = size * 0.25;

              // Adjust eye positions based on direction
              switch (direction) {
                    case 'up':
                        eye1X = x + eyeOffsetX; eye1Y = y + eyeOffsetY;
                        eye2X = x + size - eyeOffsetX - eyeSize * 2; eye2Y = y + eyeOffsetY; // Adjusted X pos
                        break;
                    case 'down':
                        eye1X = x + eyeOffsetX; eye1Y = y + size - eyeOffsetY - eyeSize * 2; // Adjusted Y pos
                        eye2X = x + size - eyeOffsetX - eyeSize * 2; eye2Y = y + size - eyeOffsetY - eyeSize * 2; // Adjusted X & Y pos
                        break;
                    case 'left':
                        eye1X = x + eyeOffsetX; eye1Y = y + eyeOffsetY;
                        eye2X = x + eyeOffsetX; eye2Y = y + size - eyeOffsetY - eyeSize * 2; // Adjusted Y pos
                        break;
                    case 'right':
                    default: // Default to right if direction is somehow invalid
                        eye1X = x + size - eyeOffsetX - eyeSize * 2; eye1Y = y + eyeOffsetY; // Adjusted X pos
                        eye2X = x + size - eyeOffsetX - eyeSize * 2; eye2Y = y + size - eyeOffsetY - eyeSize * 2; // Adjusted X & Y pos
                        break;
                }

             ctx.beginPath();
             ctx.arc(eye1X + eyeSize, eye1Y + eyeSize, eyeSize, 0, Math.PI * 2);
             ctx.fill();
             ctx.beginPath();
             ctx.arc(eye2X + eyeSize, eye2Y + eyeSize, eyeSize, 0, Math.PI * 2);
             ctx.fill();

         } else { // Body segments
             ctx.fillStyle = bodyGradient;
             ctx.beginPath();
             if (useRoundRect) {
                  // Slightly smaller than head, still rounded
                 ctx.roundRect(x + 2, y + 2, size - 4, size - 4, cornerRadius * 0.8);
             } else {
                 ctx.rect(x + 2, y + 2, size - 4, size - 4);
             }
             ctx.fill();
             // Optional: Add subtle border for definition
             ctx.strokeStyle = isGhost ? '#26C6DA' : '#2E7D32';
             ctx.lineWidth = 1;
             ctx.stroke();
         }
    });
}

function drawFood() {
    const x = food.x * GRID_SIZE;
    const y = food.y * GRID_SIZE;
    const size = GRID_SIZE;
    const radius = size / 2 - 2; // Slightly smaller than grid size

    ctx.fillStyle = FOOD_COLORS[food.type] || '#FFFFFF'; // Fallback white
    // Apply shadow for visual pop
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;

    ctx.beginPath();
     // Draw specific shapes for different food types
     if (food.type === 'bonus') { // Star
          drawStar(x + size / 2, y + size / 2, 5, radius * 1.1, radius * 0.5);
     } else if (food.type === 'ghost') { // Diamond
          drawDiamond(x + size/2, y + size/2, size * 0.8);
     } else if (food.type === 'slow') { // Snowflake
          drawSnowflake(x + size/2, y + size/2, radius * 1.1);
     }
     else { // Circle for standard food
         ctx.arc(x + size / 2, y + size / 2, radius, 0, Math.PI * 2);
     }
    ctx.fill();

    // Reset shadow for other drawings
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
}

// Helper drawing functions for food shapes
function drawStar(cx, cy, spikes, outerRadius, innerRadius) {
    let rot = Math.PI / 2 * 3;
    let x = cx;
    let y = cy;
    let step = Math.PI / spikes;

    ctx.beginPath();
    ctx.moveTo(cx, cy - outerRadius)
    for (let i = 0; i < spikes; i++) {
        x = cx + Math.cos(rot) * outerRadius;
        y = cy + Math.sin(rot) * outerRadius;
        ctx.lineTo(x, y)
        rot += step

        x = cx + Math.cos(rot) * innerRadius;
        y = cy + Math.sin(rot) * innerRadius;
        ctx.lineTo(x, y)
        rot += step
    }
    ctx.lineTo(cx, cy - outerRadius);
    ctx.closePath();
}

function drawDiamond(cx, cy, size) {
    const halfSize = size / 2;
     ctx.beginPath();
     ctx.moveTo(cx, cy - halfSize); // Top point
     ctx.lineTo(cx + halfSize, cy); // Right point
     ctx.lineTo(cx, cy + halfSize); // Bottom point
     ctx.lineTo(cx - halfSize, cy); // Left point
     ctx.closePath();
}

 function drawSnowflake(cx, cy, radius) {
      ctx.save(); // Save context state
      ctx.beginPath();
      ctx.lineWidth = Math.max(1, radius * 0.15); // Adjust line width based on radius
      ctx.strokeStyle = ctx.fillStyle; // Use fill color for lines

      for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 3) * i - Math.PI / 2; // Rotate slightly to make it upright
          const x1 = cx + Math.cos(angle) * radius;
          const y1 = cy + Math.sin(angle) * radius;
          ctx.moveTo(cx, cy);
          ctx.lineTo(x1, y1);

          // Add small branches (relative to main branch end)
          const branchLength = radius * 0.4;
          for (let j = -1; j <= 1; j += 2) { // Draw two branches per main line
              const branchAngle = angle + j * (Math.PI / 5); // Angle of the small branches
              const branchEndX = x1 - Math.cos(branchAngle) * branchLength;
              const branchEndY = y1 - Math.sin(branchAngle) * branchLength;
              ctx.moveTo(x1, y1);
              ctx.lineTo(branchEndX, branchEndY);
          }
      }
      ctx.stroke();
      ctx.restore(); // Restore context state (line width etc.)
 }

function drawObstacles() {
    ctx.fillStyle = OBSTACLE_COLOR;
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 5;
     ctx.shadowOffsetX = 1;
     ctx.shadowOffsetY = 1;
     const useRoundRect = typeof ctx.roundRect === 'function';


    obstacles.forEach(obs => {
         const x = obs.x * GRID_SIZE;
         const y = obs.y * GRID_SIZE;
         const size = GRID_SIZE;
         ctx.beginPath();
          if (useRoundRect) {
               // Slightly rounded square
               ctx.roundRect(x + 2, y + 2, size - 4, size - 4, size * 0.1);
          } else {
               ctx.rect(x + 2, y + 2, size - 4, size - 4);
          }
         ctx.fill();
    });
     // Reset shadow
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
}

// --- Food and Obstacle Placement ---
function isPositionOccupied(x, y, checkSnake = true, checkObstacles = true) {
    // Check Snake position
    if (checkSnake && snake) {
        for (const segment of snake) {
            if (segment.x === x && segment.y === y) return true;
        }
    }
     // Check Obstacle position
     if (checkObstacles && obstacles) {
          for (const obs of obstacles) {
              if (obs.x === x && obs.y === y) return true;
          }
     }

     // Check if the position is the current food position (to avoid placing obstacle on food)
     if (food && food.x === x && food.y === y) {
         return true;
     }


    return false;
}

function placeFood() {
    let newFood;
    let foodType;
    const random = Math.random();

    // Determine food type based on probability
    if (random < 0.08) { foodType = 'ghost'; } // 8%
    else if (random < 0.18) { foodType = 'bonus'; } // 10%
    else if (random < 0.30) { foodType = 'slow'; } // 12%
    else { foodType = 'standard'; } // 70%

    let attempts = 0;
    const maxAttempts = TILE_COUNT_X * TILE_COUNT_Y; // Safety break

    do {
        newFood = {
            x: Math.floor(Math.random() * TILE_COUNT_X),
            y: Math.floor(Math.random() * TILE_COUNT_Y),
            type: foodType
        };
        attempts++;
        if (attempts > maxAttempts) {
            console.error("Could not place food after max attempts. Board might be full.");
            // Handle error case - maybe place standard food at a default safe spot?
            // For now, just return a default position (can be overwritten)
            return { x: 0, y: 0, type: 'standard' };
        }
    } while (isPositionOccupied(newFood.x, newFood.y, true, true)); // Check against snake and obstacles

    return newFood;
}

function placeObstacles() {
    const placedObstacles = [];
    const safeZoneRadius = 4; // Don't place obstacles too close to the snake start
    const startX = Math.floor(TILE_COUNT_X / 2);
    const startY = Math.floor(TILE_COUNT_Y / 2);

     // Determine initial snake positions to avoid spawning obstacles on them
     const initialSnakePositions = new Set();
     if (snake) { // Check if snake exists (important during initial setup)
         snake.forEach(seg => initialSnakePositions.add(`${seg.x},${seg.y}`));
     } else { // Define default start if snake isn't initialized yet
         initialSnakePositions.add(`${startX},${startY}`);
         initialSnakePositions.add(`${startX - 1},${startY}`);
         initialSnakePositions.add(`${startX - 2},${startY}`);
     }

    let attempts = 0;
    const maxAttempts = TILE_COUNT_X * TILE_COUNT_Y * 2; // Generous safety break

    while (placedObstacles.length < OBSTACLE_COUNT && attempts < maxAttempts) {
        attempts++;
        const obs = {
            x: Math.floor(Math.random() * TILE_COUNT_X),
            y: Math.floor(Math.random() * TILE_COUNT_Y)
        };

        // Check if position is occupied by existing obstacles or initial snake
        let occupied = false;
        for(const po of placedObstacles) {
            if(po.x === obs.x && po.y === obs.y) {
                occupied = true;
                break;
            }
        }
        if (!occupied && initialSnakePositions.has(`${obs.x},${obs.y}`)) {
            occupied = true;
        }

        // Check if within safe start zone
        const distSq = (obs.x - startX)**2 + (obs.y - startY)**2;
        if (!occupied && distSq < safeZoneRadius**2) {
             occupied = true;
         }

        // Check if the spot is where the first food *might* spawn (less critical but avoids immediate collision)
        // This check is difficult without knowing where food WILL be. Skip for simplicity.

        if (!occupied) {
            placedObstacles.push(obs);
        }
    }

     if (attempts >= maxAttempts) {
         console.warn(`Could only place ${placedObstacles.length}/${OBSTACLE_COUNT} obstacles.`);
     }
    return placedObstacles;
}

// --- Power-ups ---
function activatePowerUp(type) {
    resetPowerUps(); // Only one power-up active at a time
    powerUpTimer = POWERUP_DURATION;
    let statusText = "";

    switch (type) {
        case 'ghost':
            ghostModeActive = true;
            statusText = "👻 Ghost Mode!";
            break;
         case 'speedBoost':
             speedBoostActive = true;
             statusText = "🌟 Speed Boost!";
             updateGameSpeed(); // Immediately apply speed change
             break;
         case 'slowDown':
             slowDownActive = true;
             statusText = "❄️ Slow Down!";
             updateGameSpeed(); // Immediately apply speed change
             break;
    }
     if(statusText) showStatusIndicator(statusText, POWERUP_DURATION);
}

function resetPowerUps() {
    let speedNeedsUpdate = speedBoostActive || slowDownActive; // Check if speed was modified

    ghostModeActive = false;
    speedBoostActive = false;
     slowDownActive = false;
    powerUpTimer = 0;
    hideStatusIndicator();

     // If speed was modified, recalculate based on score only
     if (speedNeedsUpdate && gameState === 'playing') {
        updateGameSpeed();
     }
}

 function updatePowerUpTimers() {
     if (powerUpTimer > 0 && gameState === 'playing') { // Only tick down timer when playing
         powerUpTimer -= currentSpeed; // Decrement by game tick interval
         if (powerUpTimer <= 0) {
             resetPowerUps();
              console.log("Power-up expired");
         } else {
            // Update visual timer in status indicator
             updateStatusIndicatorTimer(Math.ceil(powerUpTimer / 1000));
         }
     }
 }

 function showStatusIndicator(text, duration) {
     statusIndicatorEl.textContent = `${text} (${Math.ceil(duration / 1000)}s)`;
     statusIndicatorEl.classList.add('visible');
 }
function updateStatusIndicatorTimer(secondsLeft) {
     if (statusIndicatorEl.classList.contains('visible')) {
        // Extract the base text before the parenthesis (if exists)
         const currentText = statusIndicatorEl.textContent;
         const parenIndex = currentText.lastIndexOf(' (');
         const baseText = parenIndex > 0 ? currentText.substring(0, parenIndex) : currentText;
         // Update text only if seconds left is positive
         if(secondsLeft > 0) {
            statusIndicatorEl.textContent = `${baseText} (${secondsLeft}s)`;
         } else {
            // If timer hits 0, let resetPowerUps handle hiding it
         }
     }
}

 function hideStatusIndicator() {
     statusIndicatorEl.classList.remove('visible');
 }

// --- Game State Management ---
function setGameState(newState) {
    // Prevent invalid state transitions if needed
    if (gameState === newState) return;

    gameState = newState;
    console.log("GameState changed to:", gameState);

    // Handle state-specific actions
    switch (gameState) {
        case 'ready':
            showOverlay('start');
            if (gameLoopInterval) clearInterval(gameLoopInterval);
            draw(); // Draw initial state (grid etc)
            break;
        case 'playing':
             hideAllOverlays();
             // Ensure focus when starting to play
             canvas.focus();
             // Start loop (restarts if speed changed)
             updateGameSpeed(); // Recalculates speed and starts loop
            break;
        case 'paused':
            showOverlay('pause');
            if (gameLoopInterval) clearInterval(gameLoopInterval);
             // Keep status indicator text but stop timer updates visually
             if(powerUpTimer > 0) updateStatusIndicatorTimer(Math.ceil(powerUpTimer / 1000));
            break;
        case 'gameOver':
            showOverlay('gameOver');
            if (gameLoopInterval) clearInterval(gameLoopInterval);
            saveHighScore();
            finalScoreEl.textContent = score;
             hideStatusIndicator();
            break;
    }
}

 function showOverlay(type) {
     hideAllOverlays(); // Hide others first
     let overlayToShow = null;
     if (type === 'start') overlayToShow = startOverlay;
     else if (type === 'pause') overlayToShow = pauseOverlay;
     else if (type === 'gameOver') overlayToShow = gameoverOverlay;

     if(overlayToShow) overlayToShow.classList.add('visible');
 }

 function hideAllOverlays() {
     startOverlay.classList.remove('visible');
     pauseOverlay.classList.remove('visible');
     gameoverOverlay.classList.remove('visible');
 }

function gameOver() {
     if (gameState === 'gameOver') return; // Prevent multiple calls
     console.log("Game Over Triggered");
    setGameState('gameOver');
}

// --- Input Handling ---
function handleKeyDown(e) {
    // console.log("Key Pressed:", e.key, "Current State:", gameState); // Debugging

    // Start / Restart (Enter or Space)
    if ((gameState === 'ready' || gameState === 'gameOver') && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault(); // Prevent space bar scrolling page
        resetGame(); // Resets variables and places elements
        setGameState('playing'); // Starts the game loop
        return;
    }

    // Pause / Resume (P key)
    if (e.key.toLowerCase() === 'p') {
        e.preventDefault();
        if (gameState === 'playing') {
            setGameState('paused');
        } else if (gameState === 'paused') {
            setGameState('playing');
             // If resuming with an active power-up, make sure indicator is shown correctly
             if(powerUpTimer > 0) {
                updateStatusIndicatorTimer(Math.ceil(powerUpTimer / 1000)); // Show correct time
                statusIndicatorEl.classList.add('visible'); // Ensure visible
             }
        }
        return;
    }

    // Movement Input (Only when playing)
    if (gameState === 'playing') {
        let requestedDirection = null;
        switch (e.key) {
            case 'ArrowUp': case 'w': case 'W': requestedDirection = 'up'; break;
            case 'ArrowDown': case 's': case 'S': requestedDirection = 'down'; break;
            case 'ArrowLeft': case 'a': case 'A': requestedDirection = 'left'; break;
            case 'ArrowRight': case 'd': case 'D': requestedDirection = 'right'; break;
        }

        if (requestedDirection) {
            e.preventDefault(); // Prevent arrow keys scrolling page
            // Prevent immediate reversal based on the *current* direction
            const isOpposite =
                (requestedDirection === 'up' && direction === 'down') ||
                (requestedDirection === 'down' && direction === 'up') ||
                (requestedDirection === 'left' && direction === 'right') ||
                (requestedDirection === 'right' && direction === 'left');

            // Allow change if not opposite (update the buffered nextDirection)
            if (!isOpposite) {
                nextDirection = requestedDirection;
                // console.log("Next Direction Buffered:", nextDirection);
            }
        }
    }
}

// --- Event Listeners ---
document.addEventListener('keydown', handleKeyDown);

// Ensure buttons work even if JS loads before DOM fully ready (though script at end helps)
startButton.addEventListener('click', () => {
    if (gameState === 'ready') {
         resetGame();
         setGameState('playing');
    }
});
restartButton.addEventListener('click', () => {
     if (gameState === 'gameOver') {
         resetGame();
         setGameState('playing');
     }
});


// --- Start the Game ---
// Use DOMContentLoaded for extensions, it's generally safer than window.onload
document.addEventListener('DOMContentLoaded', init);
// Fallback / alternative: just call init() directly as script is at end of body
// init();