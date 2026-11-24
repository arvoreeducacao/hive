const painters = [];

function paintWithTiles(paint) {
  if (!painters.includes(paint)) painters.push(paint);
}

function paintTileExtras(el, s, pos) {
  for (const paint of painters) paint(el, s, pos);
}

export { paintTileExtras, paintWithTiles };
