// Sizzlog Station - Restaurant Game
// Uses HTML5 Canvas for rendering

const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");

// --- GAME STATE ---
let gameRunning = false;
let animationId = null;
let currentStation = "order"; // order, cook, plate
let score = 0;
let tips = 0;
let currentDay = 1;
let customersToServe = 3;
let customersSpawned = 0;
let isDayEnd = false;
let lastSpriteIdx = -1;
let lastItemName = "";
let spriteBag = [];
let toastMessage = null;

// Ticket & Customer System
let customers = [];
let tickets = [];
let activeTicketId = null;
let customerIdCounter = 1;
let ticketCounter = 1;
let spawnTimer = 100;
let isTakingOrder = false;
let takingOrderTimer = 0;
let pendingCustomerOrder = null;

// Cook Station - 6 grill slots
let grillSlots = [
  { id: 0, x: 120, y: 140, item: null, progress: 0, flipped: false },
  { id: 1, x: 300, y: 140, item: null, progress: 0, flipped: false },
  { id: 2, x: 480, y: 140, item: null, progress: 0, flipped: false },
  { id: 3, x: 120, y: 280, item: null, progress: 0, flipped: false },
  { id: 4, x: 300, y: 280, item: null, progress: 0, flipped: false },
  { id: 5, x: 480, y: 280, item: null, progress: 0, flipped: false },
];
let holdingArea = [];
let selectedBin = null;

// Plate Station
let plateItems = [];

// Menu items
const menuItems = [
  { name: "Tapsilog", meat: "Tapa", img: "sizzling-tapsilog.jpeg" },
  { name: "Tocilog", meat: "Tocino", img: "sizzling-tocilog.jpeg" },
  { name: "Sisig", meat: "Sisig", img: "sizzling-pork-sisig.jpeg" },
  { name: "Bangsilog", meat: "Bangus", img: "sizzling-bangsilog.jpeg" },
  { name: "Hotsilog", meat: "Hotdog", img: "sizzling-hotsilog.jpeg" },
];
const binIngredients = [
  "Tapa",
  "Tocino",
  "Sisig",
  "Bangus",
  "Hotdog",
  "Egg",
  "Rice",
];

const customerSprites = [
  "customer-female-1.png",
  "customer-female-2.png",
  "customer-female-3.png",
  "customer-female-4.png",
  "customer-female-5.png",
  "customer-male-1.png",
  "customer-male-2.png",
  "customer-male-3.png",
  "customer-male-4.png",
  "customer-male-5.png",
];

const images = {};
let imagesLoaded = 0;
let totalImages = 0;

function loadImage(key, src) {
  totalImages++;
  const img = new Image();
  img.onload = () => {
    images[key] = img;
    imagesLoaded++;
  };
  img.onerror = () => {
    imagesLoaded++;
  };
  img.src = src;
}

function loadAssets() {
  loadImage("bg-order", "assets/ordering-station.jpeg");
  loadImage("bg-taking", "assets/taking-order.jpeg");
  loadImage("bg-cook", "assets/cooking-station.jpeg");
  loadImage("bg-plate", "assets/plating-station.jpeg");
  customerSprites.forEach((file, i) =>
    loadImage("cust-" + i, "assets/" + file),
  );
}

function waitForAssets(cb) {
  if (imagesLoaded >= totalImages) cb();
  else setTimeout(() => waitForAssets(cb), 100);
}

function startGame() {
  gameRunning = true;
  score = 0;
  tips = 0;
  currentDay = 1;
  lastTime = 0;
  resetDay();
  loadAssets();
  waitForAssets(() => {
    animationId = requestAnimationFrame(gameLoop);
  });
}

function stopGame() {
  gameRunning = false;
  cancelAnimationFrame(animationId);
}

function resetDay() {
  customers = [];
  tickets = [];
  holdingArea = [];
  plateItems = [];
  activeTicketId = null;
  grillSlots.forEach((s) => {
    s.item = null;
    s.progress = 0;
    s.flipped = false;
  });
  currentStation = "order";
  spawnTimer = 50;
}

// --- GAME LOGIC ---

let lastTime = 0;

function gameLoop(timestamp) {
  if (!gameRunning) return;
  if (!lastTime) lastTime = timestamp;
  let dt = timestamp - lastTime;
  lastTime = timestamp;
  if (dt > 100) dt = 16; // prevent lag spikes

  updateLogic(dt);
  draw();
  animationId = requestAnimationFrame(gameLoop);
}

function updateLogic(dt) {
  if (isTakingOrder) {
    takingOrderTimer += dt;
  }

  // Spawn customers
  if (!isDayEnd && customersSpawned < customersToServe) {
    if (spawnTimer > 0) spawnTimer -= dt;

    if (customers.length < 3 && spawnTimer <= 0) {
      // Shuffle sprite list so customers don't repeat
      if (spriteBag.length === 0) {
        spriteBag = Array.from({ length: customerSprites.length }, (_, i) => i);
        for (let i = spriteBag.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [spriteBag[i], spriteBag[j]] = [spriteBag[j], spriteBag[i]];
        }
      }
      let sIdx = spriteBag.pop();

      // Pick random order (no same order twice in a row)
      let itm;
      do {
        itm = menuItems[Math.floor(Math.random() * menuItems.length)];
      } while (menuItems.length > 1 && itm.name === lastItemName);
      lastItemName = itm.name;

      // Random patience that gets harder each day
      const basePat = Math.max(60, 110 - currentDay * 3);
      const pat = basePat + Math.floor(Math.random() * 30 - 15);

      // Randomly decide if order includes egg and/or rice
      let orderItem = { ...itm };
      orderItem.wantsEgg = Math.random() > 0.25; // 75% chance wants egg
      orderItem.wantsRice = Math.random() > 0.2; // 80% chance wants rice
      // Must want at least one side
      if (!orderItem.wantsEgg && !orderItem.wantsRice) {
        Math.random() > 0.5
          ? (orderItem.wantsEgg = true)
          : (orderItem.wantsRice = true);
      }

      customers.push({
        id: customerIdCounter++,
        spriteIdx: sIdx,
        item: orderItem,
        patience: pat,
        maxPatience: pat,
        state: "waiting",
        x: 750,
        targetX: 250 + customers.length * 130,
      });
      customersSpawned++;
      spawnTimer = Math.max(3000, 8000 - currentDay * 300);
    }
  }

  // Check if day is over
  if (
    !isDayEnd &&
    customersSpawned >= customersToServe &&
    customers.length === 0 &&
    tickets.length === 0
  ) {
    isDayEnd = true;
  }

  // Update customers
  for (let i = customers.length - 1; i >= 0; i--) {
    let c = customers[i];
    c.patience -= dt * 0.0015;

    // Walk to position
    c.targetX = 250 + i * 130;
    if (c.x > c.targetX) {
      c.x -= dt * 0.25;
      if (c.x < c.targetX) c.x = c.targetX;
    }

    if (c.patience <= 0) {
      // Customer left angry
      score = Math.max(0, score - (30 + currentDay * 5));
      // Remove ticket
      tickets = tickets.filter((t) => t.customerId !== c.id);
      if (activeTicketId === c.id)
        activeTicketId = tickets.length > 0 ? tickets[0].id : null;
      if (pendingCustomerOrder && pendingCustomerOrder.id === c.id) {
        pendingCustomerOrder = null;
        isTakingOrder = false;
      }
      customers.splice(i, 1);
    }
  }

  // Update grill
  const grillSpeed = 0.008 + currentDay * 0.0005;
  grillSlots.forEach((slot) => {
    if (slot.item) {
      slot.progress += dt * grillSpeed;
    }
  });

  // Update toast message
  if (toastMessage) {
    toastMessage.timer -= dt;
    if (toastMessage.timer <= 0) toastMessage = null;
  }
}

// --- DRAWING ---

function draw() {
  ctx.clearRect(0, 0, 960, 540);

  if (isDayEnd) {
    // Day complete screen
    ctx.fillStyle = "#1A1A1A";
    ctx.fillRect(0, 0, 960, 540);
    ctx.fillStyle = "#FFF";
    ctx.font = "bold 48px Fredoka, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Day " + currentDay + " Complete!", 480, 200);

    ctx.font = "24px sans-serif";
    ctx.fillStyle = "#CCC";
    ctx.fillText("Total Score: " + score, 480, 260);
    ctx.fillText("Total Tips: ₱" + tips, 480, 300);

    // Next Day button
    ctx.fillStyle = "#E8621C";
    roundRect(ctx, 380, 380, 200, 50, 25);
    ctx.fill();
    ctx.fillStyle = "#FFF";
    ctx.font = "bold 20px sans-serif";
    ctx.fillText("Start Next Day", 480, 412);
    ctx.textAlign = "left";
    return;
  }

  // Background
  let bgImgName = "bg-" + currentStation;
  if (currentStation === "order" && isTakingOrder) bgImgName = "bg-taking";

  let bgImg = images[bgImgName];
  if (bgImg) ctx.drawImage(bgImg, 0, 0, 960, 540);
  else {
    ctx.fillStyle = "#444";
    ctx.fillRect(0, 0, 960, 540);
  }

  if (currentStation === "order") drawOrderStation();
  else if (currentStation === "cook") drawCookStation();
  else if (currentStation === "plate") drawPlateStation();

  // UI elements
  drawTicketRail();
  drawRightPanel();
  drawStationButtons();
  drawHUD();

  // Show held ingredient on cursor
  if (selectedBin && mousePos) {
    ctx.fillStyle = "#FFF";
    ctx.font = "20px sans-serif";
    ctx.fillText(selectedBin, mousePos.x, mousePos.y);
  }

  // Show score toast
  if (toastMessage) {
    const alpha = Math.min(1, toastMessage.timer / 500);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = toastMessage.color || "rgba(0,0,0,0.8)";
    roundRect(ctx, 280, 230, 400, 60, 15);
    ctx.fill();
    ctx.fillStyle = "#FFF";
    ctx.font = "bold 18px Fredoka, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(toastMessage.text, 480, 268);
    ctx.textAlign = "left";
    ctx.globalAlpha = 1;
  }
}

function drawOrderStation() {
  if (isTakingOrder) {
    if (pendingCustomerOrder) {
      const c = pendingCustomerOrder;
      const custImg = images["cust-" + c.spriteIdx];
      if (custImg && custImg.height > 0) {
        let ch = 350;
        let cw = (custImg.width / custImg.height) * ch;

        ctx.save();
        ctx.beginPath();
        // Clip so customer appears behind counter
        ctx.rect(0, 0, 960, 360);
        ctx.clip();
        ctx.drawImage(custImg, 420, 130, cw, ch);
        ctx.restore();
      }

      // Speech bubble
      const bx = 300,
        by = 120,
        bw = 180,
        bh = 90;
      ctx.fillStyle = "#FFF";
      roundRect(ctx, bx, by, bw, bh, 15);
      ctx.fill();
      // Bubble pointer
      ctx.beginPath();
      ctx.moveTo(bx + bw - 5, by + 40);
      ctx.lineTo(bx + bw + 20, by + 60);
      ctx.lineTo(bx + bw - 5, by + 80);
      ctx.fill();

      ctx.fillStyle = "#333";
      ctx.font = "bold 16px Fredoka, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("I would like...", bx + bw / 2, by + 35);
      ctx.fillStyle = "#E8621C";
      ctx.font = "bold 22px sans-serif";
      ctx.fillText(c.item.name + "!", bx + bw / 2, by + 65);
      ctx.textAlign = "left";
    }
    return;
  }

  // Clip so customers stay within panel area
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, 745, 540);
  ctx.clip();

  // Draw customers
  customers.forEach((c) => {
    // Draw customer sprite
    const custImg = images["cust-" + c.spriteIdx];
    let cw = 160,
      ch = 350;
    if (custImg && custImg.height > 0) {
      ch = 320;
      cw = (custImg.width / custImg.height) * ch;
      ctx.drawImage(custImg, c.x, 480 - ch, cw, ch);
    }

    // Patience bar
    const barW = 100,
      barH = 10;
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(c.x + cw / 2 - barW / 2, 140, barW, barH);
    const pct = c.patience / c.maxPatience;
    ctx.fillStyle = pct > 0.5 ? "#4CAF50" : pct > 0.25 ? "#FFC107" : "#F44336";
    ctx.fillRect(c.x + cw / 2 - barW / 2, 140, barW * pct, barH);
    ctx.strokeStyle = "#FFF";
    ctx.strokeRect(c.x + cw / 2 - barW / 2, 140, barW, barH);

    // Speech bubble
    const bx = c.x + cw / 2 - 50;
    const by = 75;
    if (c.state === "waiting") {
      ctx.fillStyle = "#FFF";
      roundRect(ctx, bx, by, 100, 50, 10);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(bx + 20, by + 50);
      ctx.lineTo(bx + 40, by + 60);
      ctx.lineTo(bx + 50, by + 50);
      ctx.fill();
      // Take Order button
      drawBtn(bx + 5, by + 5, 90, 40, "Take Order", "#E8621C");
    } else {
      ctx.fillStyle = "#FFF";
      roundRect(ctx, bx, by, 100, 50, 10);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(bx + 20, by + 50);
      ctx.lineTo(bx + 40, by + 60);
      ctx.lineTo(bx + 50, by + 50);
      ctx.fill();
      ctx.fillStyle = "#333";
      ctx.font = "bold 13px Fredoka, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Waiting", bx + 50, by + 20);
      ctx.fillText("for food...", bx + 50, by + 38);
      ctx.textAlign = "left";
    }
  });

  ctx.restore();
}

function getCookStatus(slot) {
  if (!slot.item) return null;
  const p = slot.progress;
  if (slot.item === "Rice") {
    if (p < 100) return { label: "Cooking", color: "#FFC107", pct: p / 100 };
    if (p < 150) return { label: "DONE", color: "#4CAF50", pct: 1 };
    return { label: "BURNT", color: "#F44336", pct: 1 };
  } else {
    // Meat/Egg needs flipping
    if (!slot.flipped) {
      if (p < 100) return { label: "Cooking", color: "#FFC107", pct: p / 100 };
      if (p < 130)
        return { label: "FLIP NOW!", color: "#E8621C", pct: 1, action: "flip" };
      return { label: "BURNT", color: "#F44336", pct: 1 };
    } else {
      // Second side
      if (p < 200)
        return {
          label: "Cooking Side 2",
          color: "#FFC107",
          pct: (p - 100) / 100,
        };
      if (p < 240) return { label: "DONE", color: "#4CAF50", pct: 1 };
      return { label: "BURNT", color: "#F44336", pct: 1 };
    }
  }
}

function drawCookStation() {
  // Ingredient bins
  binIngredients.forEach((ing, i) => {
    const bx = 30 + i * 95;
    const by = 450;
    drawBtn(bx, by, 85, 50, ing, selectedBin === ing ? "#FFC107" : "#555");
  });

  // Grill slots
  grillSlots.forEach((slot) => {
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    roundRect(ctx, slot.x, slot.y, 140, 120, 10);
    ctx.fill();
    ctx.strokeStyle = "#222";
    ctx.lineWidth = 2;
    ctx.stroke();

    if (slot.item) {
      ctx.fillStyle = "#FFF";
      ctx.font = "bold 16px Fredoka, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(slot.item, slot.x + 70, slot.y + 30);

      const status = getCookStatus(slot);

      // Progress bar
      ctx.fillStyle = "#222";
      ctx.fillRect(slot.x + 20, slot.y + 45, 100, 12);
      ctx.fillStyle = status.color;
      ctx.fillRect(slot.x + 20, slot.y + 45, 100 * status.pct, 12);

      // Label
      ctx.fillText(status.label, slot.x + 70, slot.y + 75);

      // Action button
      if (status.label === "FLIP NOW!")
        drawBtn(slot.x + 30, slot.y + 85, 80, 25, "FLIP", "#E8621C");
      else if (status.label === "DONE")
        drawBtn(slot.x + 30, slot.y + 85, 80, 25, "TAKE", "#4CAF50");
      else if (status.label === "BURNT")
        drawBtn(slot.x + 30, slot.y + 85, 80, 25, "TRASH", "#F44336");

      ctx.textAlign = "left";
    }
  });
}

function drawPlateStation() {
  // Plate
  ctx.fillStyle = "#222";
  ctx.beginPath();
  ctx.ellipse(440, 360, 200, 120, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#333";
  ctx.beginPath();
  ctx.ellipse(440, 355, 180, 105, 0, 0, Math.PI * 2);
  ctx.fill();

  // Plated Items
  plateItems.forEach((item, i) => {
    const px = 330 + i * 110;
    const py = 350;
    ctx.fillStyle = "rgba(76,175,80,0.8)";
    ctx.beginPath();
    ctx.ellipse(px, py, 55, 35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#FFF";
    ctx.font = "bold 16px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(item.name, px, py + 5);
    ctx.textAlign = "left";
  });

  // Holding Area
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(30, 130, 160, 380);
  ctx.fillStyle = "#FFF";
  ctx.font = "bold 16px Fredoka, sans-serif";
  ctx.fillText("Holding Area", 55, 155);
  holdingArea.forEach((item, i) => {
    drawBtn(
      40,
      180 + i * 50,
      140,
      40,
      item.name + (item.quality < 100 ? " (Bad)" : ""),
      item.quality >= 100 ? "#4CAF50" : "#FFC107",
    );
  });
}

function drawTicketRail() {
  ctx.fillStyle = "#222";
  ctx.fillRect(0, 0, 680, 70);

  tickets.forEach((t, i) => {
    const tx = 20 + i * 80;
    ctx.fillStyle = "#FFF";
    ctx.fillRect(tx, 5, 70, 60);
    if (t.id === activeTicketId) {
      ctx.strokeStyle = "#FFC107";
      ctx.lineWidth = 3;
      ctx.strokeRect(tx, 5, 70, 60);
    }

    ctx.fillStyle = "#333";
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Order #" + t.id, tx + 35, 25);
    ctx.fillStyle = "#E8621C";
    ctx.font = "bold 12px sans-serif";
    ctx.fillText(t.item.name, tx + 35, 45);
    ctx.textAlign = "left";
  });
}

function drawRightPanel() {
  const tx = 768,
    ty = 128,
    tw = 178,
    th = 324;

  let drawItem = null;
  if (isTakingOrder && pendingCustomerOrder && takingOrderTimer >= 1500) {
    drawItem = pendingCustomerOrder.item;
  } else if (activeTicketId && !isTakingOrder) {
    const activeT = tickets.find((t) => t.id === activeTicketId);
    if (activeT) drawItem = activeT.item;
  }

  if (drawItem) {
    ctx.fillStyle = "#F4F4F0";
    ctx.fillRect(tx, ty, tw, th);
    ctx.fillStyle = "#E8621C";
    ctx.fillRect(tx, ty, tw, 40);
    ctx.fillStyle = "#FFF";
    ctx.font = "bold 16px Fredoka, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("ORDER TICKET", tx + tw / 2, ty + 25);

    ctx.fillStyle = "#333";
    ctx.font = "bold 18px Fredoka, sans-serif";
    ctx.fillText(drawItem.name, tx + tw / 2, ty + 80);

    ctx.font = "14px sans-serif";
    ctx.fillStyle = "#555";
    ctx.fillText("Meat: " + drawItem.meat, tx + tw / 2, ty + 120);
    let yOff = 150;
    if (drawItem.wantsEgg) {
      ctx.fillText("Egg: Fried Egg", tx + tw / 2, ty + yOff);
      yOff += 30;
    }
    if (drawItem.wantsRice) {
      ctx.fillText("Rice: Garlic Rice", tx + tw / 2, ty + yOff);
    }
    ctx.textAlign = "left";
  }

  // Take order / Serve button
  const pillX = 784,
    pillY = 463,
    pillW = 140,
    pillH = 38;
  if (isTakingOrder && pendingCustomerOrder && takingOrderTimer >= 1500) {
    ctx.fillStyle = "rgba(76, 175, 80, 0.5)";
    roundRect(ctx, pillX, pillY, pillW, pillH, 19);
    ctx.fill();
    ctx.fillStyle = "#FFF";
    ctx.font = "bold 18px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Take order", 854, pillY + 25);
    ctx.textAlign = "left";
  } else if (
    currentStation === "plate" &&
    activeTicketId &&
    plateItems.length > 0
  ) {
    drawBtn(pillX, pillY, pillW, pillH, "🍽️ SERVE ORDER", "#4CAF50");
  }
}

function drawStationButtons() {
  const buttons = [
    { label: "📝", station: "order", color: "#4CAF50", x: 753 },
    { label: "🍳", station: "cook", color: "#E8621C", x: 823 },
    { label: "🍽️", station: "plate", color: "#2196F3", x: 893 },
  ];
  buttons.forEach((btn) => {
    const y = 35,
      r = 25;
    ctx.beginPath();
    ctx.arc(btn.x, y, r, 0, Math.PI * 2);
    ctx.fillStyle =
      currentStation === btn.station ? btn.color : "rgba(0,0,0,0.5)";
    ctx.fill();
    ctx.strokeStyle = currentStation === btn.station ? "#FFF" : "#888";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = "#FFF";
    ctx.font = "22px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(btn.label, btn.x, y + 8);
  });
  ctx.textAlign = "left";
}

function drawHUD() {
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillRect(0, 70, 260, 30);
  ctx.fillStyle = "#FFF";
  ctx.font = "bold 15px Fredoka, sans-serif";
  ctx.fillText(
    "Day " + currentDay + " | Score: " + score + " | Tips: ₱" + tips,
    10,
    90,
  );
}

function drawBtn(x, y, w, h, text, color) {
  ctx.fillStyle = color;
  roundRect(ctx, x, y, w, h, Math.min(10, h / 2));
  ctx.fill();
  ctx.fillStyle = "#FFF";
  ctx.font = "bold 14px Fredoka, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(text, x + w / 2, y + h / 2 + 5);
  ctx.textAlign = "left";
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.lineTo(x + w - r, y);
  c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h - r);
  c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h);
  c.quadraticCurveTo(x, y + h, x, y + h - r);
  c.lineTo(x, y + r);
  c.quadraticCurveTo(x, y, x + r, y);
  c.closePath();
}

// --- INPUT HANDLING ---

let mousePos = null;
canvas.addEventListener("mousemove", (e) => {
  const rect = canvas.getBoundingClientRect();
  mousePos = {
    x: (e.clientX - rect.left) * (960 / rect.width),
    y: (e.clientY - rect.top) * (540 / rect.height),
  };
});

canvas.addEventListener("click", (e) => {
  if (!gameRunning) return;
  const x = mousePos.x,
    y = mousePos.y;

  if (isDayEnd) {
    // Click "Start Next Day" button
    if (x >= 380 && x <= 580 && y >= 380 && y <= 430) {
      currentDay++;
      customersToServe++;
      customersSpawned = 0;
      isDayEnd = false;
      spawnTimer = 100;
      // Reset for new day
      currentStation = "order";
      holdingArea = [];
      plateItems = [];
      grillSlots.forEach((slot) => {
        slot.item = null;
        slot.progress = 0;
        slot.flipped = false;
      });
    }
    return;
  }

  // Station Buttons
  const statBtns = [
    { st: "order", x: 753 },
    { st: "cook", x: 823 },
    { st: "plate", x: 893 },
  ];
  for (let btn of statBtns) {
    if (Math.sqrt((x - btn.x) ** 2 + (y - 35) ** 2) < 25) {
      currentStation = btn.st;
      if (currentStation !== "order") {
        isTakingOrder = false;
        pendingCustomerOrder = null;
      }
      return;
    }
  }

  // Ticket Rail
  if (y <= 70 && x <= 680) {
    tickets.forEach((t, i) => {
      const tx = 20 + i * 80;
      if (x >= tx && x <= tx + 70) activeTicketId = t.id;
    });
    return;
  }

  if (currentStation === "order") {
    if (isTakingOrder) {
      // Take order button click
      if (
        takingOrderTimer >= 1500 &&
        x >= 760 &&
        x <= 950 &&
        y >= 440 &&
        y <= 520
      ) {
        isTakingOrder = false;
        if (pendingCustomerOrder) {
          pendingCustomerOrder.state = "ordered";
          const newTicket = {
            id: ticketCounter++,
            customerId: pendingCustomerOrder.id,
            item: pendingCustomerOrder.item,
            status: "open",
          };
          tickets.push(newTicket);
          if (!activeTicketId) activeTicketId = newTicket.id;
          pendingCustomerOrder = null;
        }
        return;
      }
    } else {
      customers.forEach((c) => {
        const custImg = images["cust-" + c.spriteIdx];
        let cw = 160;
        if (custImg && custImg.height > 0)
          cw = (custImg.width / custImg.height) * 320;

        const bx = c.x + cw / 2 - 50;
        // Click Take Order bubble
        if (
          c.state === "waiting" &&
          x >= bx &&
          x <= bx + 100 &&
          y >= 75 &&
          y <= 125
        ) {
          isTakingOrder = true;
          takingOrderTimer = 0;
          pendingCustomerOrder = c;
        }
      });
    }
  } else if (currentStation === "cook") {
    // Ingredient bins click
    binIngredients.forEach((ing, i) => {
      const bx = 30 + i * 95,
        by = 450;
      if (x >= bx && x <= bx + 85 && y >= by && y <= by + 50) selectedBin = ing;
    });

    // Grill slots click
    grillSlots.forEach((slot) => {
      // Place ingredient on grill
      if (
        x >= slot.x &&
        x <= slot.x + 140 &&
        y >= slot.y &&
        y <= slot.y + 120
      ) {
        if (!slot.item && selectedBin) {
          slot.item = selectedBin;
          slot.progress = 0;
          slot.flipped = false;
          selectedBin = null;
        } else if (slot.item) {
          const status = getCookStatus(slot);
          if (status.label === "FLIP NOW!") slot.flipped = true;
          else if (status.label === "DONE") {
            holdingArea.push({ name: slot.item, quality: 100 });
            slot.item = null;
          } else if (status.label === "BURNT") slot.item = null;
        }
      }
    });
  } else if (currentStation === "plate") {
    // Click holding area items to plate them
    holdingArea.forEach((item, i) => {
      const bx = 40,
        by = 180 + i * 50;
      if (x >= bx && x <= bx + 140 && y >= by && y <= by + 40) {
        if (plateItems.length < 4) {
          plateItems.push(item);
          holdingArea.splice(i, 1);
        }
      }
    });

    // Serve button click
    if (
      activeTicketId &&
      x >= 760 &&
      x <= 950 &&
      y >= 440 &&
      y <= 520 &&
      plateItems.length > 0
    ) {
      serveOrder(activeTicketId);
    }
  }
});

function serveOrder(ticketId) {
  const ticket = tickets.find((t) => t.id === ticketId);
  const cust = customers.find((c) => c.id === ticket.customerId);

  if (!ticket || !cust) return;

  // Score each ingredient individually
  const order = ticket.item;
  let totalParts = 1; // meat always required
  if (order.wantsEgg) totalParts++;
  if (order.wantsRice) totalParts++;

  let correctParts = 0;
  let hasMeat = plateItems.some((i) => i.name === order.meat);
  let hasEgg = plateItems.some((i) => i.name === "Egg");
  let hasRice = plateItems.some((i) => i.name === "Rice");

  // Meat is worth double
  if (hasMeat) correctParts += 2;
  if (order.wantsEgg && hasEgg) correctParts++;
  if (order.wantsRice && hasRice) correctParts++;

  // Wrong items penalty
  let wrongItems = 0;
  if (!order.wantsEgg && hasEgg) wrongItems++;
  if (!order.wantsRice && hasRice) wrongItems++;

  // Quality score: 0-60 based on correct items
  let maxParts = totalParts + 1; // +1 because meat counts double
  let quality = Math.round((correctParts / maxParts) * 60) - wrongItems * 10;
  quality = Math.max(0, quality);

  // Cooking quality bonus: 0-20
  let cookQ = 0;
  plateItems.forEach((i) => (cookQ += i.quality));
  if (plateItems.length > 0)
    quality += Math.round((cookQ / plateItems.length) * 0.2);

  // Patience bonus: 0-20
  let patienceBonus = Math.max(
    0,
    Math.round((cust.patience / cust.maxPatience) * 20),
  );
  let roundScore = Math.round(quality + patienceBonus);

  score += roundScore;
  // Calculate tips
  if (roundScore > 80) tips += 20;
  else if (roundScore > 60) tips += 10;
  else if (roundScore > 40) tips += 5;

  // Show score on screen
  let emoji = roundScore > 80 ? "⭐" : roundScore > 50 ? "👍" : "😬";
  let toastColor =
    roundScore > 80
      ? "rgba(76,175,80,0.9)"
      : roundScore > 50
        ? "rgba(232,98,28,0.9)"
        : "rgba(244,67,54,0.9)";
  toastMessage = {
    text: `${emoji} Score: ${roundScore} | Tips: +₱${roundScore > 80 ? 20 : roundScore > 60 ? 10 : 5}`,
    color: toastColor,
    timer: 2500,
  };

  // Remove served customer and ticket
  plateItems = [];
  tickets = tickets.filter((t) => t.id !== ticketId);
  customers = customers.filter((c) => c.id !== cust.id);
  activeTicketId = tickets.length > 0 ? tickets[0].id : null;
}
