#!/bin/bash
sed -i 's|@import "@fontsource/hind-siliguri";||g' input.css

cat << 'INNER_EOF' > temp.css
@font-face {
  font-family: 'Hind Siliguri';
  src: url('./fonts/HindSiliguri-Regular.ttf') format('truetype');
  font-weight: 400;
  font-style: normal;
}

@font-face {
  font-family: 'Hind Siliguri';
  src: url('./fonts/HindSiliguri-Bold.ttf') format('truetype');
  font-weight: 700;
  font-style: normal;
}
INNER_EOF

sed -i '/@import "shadcn\/tailwind.css";/r temp.css' input.css
rm temp.css

sed -i 's|@apply border-border outline-ring/50;|@apply border-border outline-ring/50;\n    font-family: '\''Hind Siliguri'\'', sans-serif !important;|g' input.css
