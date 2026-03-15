// Change website name
document.title = "My Cool Website";

// Change tab icon (favicon)
const icon = document.createElement("link");
icon.rel = "icon";
icon.type = "image/png";
icon.href = "favicon.png";   // image file name
document.head.appendChild(icon);