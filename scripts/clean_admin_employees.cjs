const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'pages', 'admin', 'AdminEmployees.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Remove the Dialog
const dialogStartStr = '<Dialog open={openRankings} onOpenChange={setOpenRankings}>';
const dialogStartIndex = content.indexOf(dialogStartStr);

if (dialogStartIndex !== -1) {
  // We need to find the matching </Dialog>
  let depth = 0;
  let i = dialogStartIndex;
  let dialogEndIndex = -1;
  while (i < content.length) {
    if (content.substring(i, i + 7) === '<Dialog') {
      depth++;
      i += 7;
    } else if (content.substring(i, i + 9) === '</Dialog>') {
      depth--;
      if (depth === 0) {
        dialogEndIndex = i + 9;
        break;
      }
      i += 9;
    } else {
      i++;
    }
  }

  if (dialogEndIndex !== -1) {
    content = content.substring(0, dialogStartIndex) + content.substring(dialogEndIndex);
  }
}

// Write back
fs.writeFileSync(filePath, content, 'utf8');
console.log("Successfully cleaned up AdminEmployees.tsx Dialog block.");
