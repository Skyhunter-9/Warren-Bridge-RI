// ========================================================
// THE PURE SANDBOX LAYER: Directly modifies the HTML screen
// ========================================================

export const startFineTuneCircleTest = () => {
  // 1. Prevent duplicate circles from spawning if hot-reloading triggers multiple times
  const existingCircle = document.getElementById("developer-fine-tune-circle");
  if (existingCircle) return;

  // 2. Generate a standard HTML div element container
  const circleElement = document.createElement("div");
  circleElement.id = "developer-fine-tune-circle";

  // 3. --- TWEAK YOUR CIRCLE DESIGN VISUALS HERE ---
  const size = 120;             // Total diameter width of your circle in pixels
  const neonColor = "#00ff33";  // Vibrant Neon Green dot color hex string
  const outlineThickness = 6;   // Perimeter white border thickness ring size

  circleElement.style.position = "fixed";
  circleElement.style.top = "50%";
  circleElement.style.left = "50%";
  circleElement.style.transform = "translate(-50%, -50%)"; // Locks it perfectly dead center
  circleElement.style.width = `${size}px`;
  circleElement.style.height = `${size}px`;
  
  circleElement.style.backgroundColor = neonColor;
  circleElement.style.borderRadius = "50%"; // Forces a perfect mathematical round circle shape
  circleElement.style.border = `${outlineThickness}px solid #ffffff`; // Clean white outline ring
  circleElement.style.boxShadow = "0px 0px 15px rgba(0,255,51,0.7), inset 0px 0px 6px rgba(0,0,0,0.3)";
  
  circleElement.style.pointerEvents = "none"; // CRITICAL: Allows mouse clicks to pass through so you can continue spinning your bridge
  circleElement.style.zIndex = "999999";       // Guarantees it floats over your WebGL view windows

  // 4. Inject a small design crosshair accent dot directly into the center core area
  const centerDot = document.createElement("div");
  centerDot.style.width = "10px";
  centerDot.style.height = "10px";
  centerDot.style.backgroundColor = "#222222";
  centerDot.style.borderRadius = "50%";
  centerDot.style.position = "absolute";
  centerDot.style.top = "50%";
  centerDot.style.left = "50%";
  centerDot.style.transform = "translate(-50%, -50%)";
  circleElement.appendChild(centerDot);

  // 5. Instantly attach the circle to the webpage body container
  document.body.appendChild(circleElement);
};

export const stopFineTuneCircleTest = () => {
  const existingCircle = document.getElementById("developer-fine-tune-circle");
  if (existingCircle) {
    existingCircle.remove();
  }
};
