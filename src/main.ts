import '@fontsource/fredoka/latin-500.css';
import '@fontsource/fredoka/latin-600.css';
import '@fontsource/fredoka/latin-700.css';
import './styles.css';
import { Game } from './game/Game';
import { showFatal } from './ui/Modals';

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

const app = document.getElementById('app')!;
if (!webglAvailable()) {
  showFatal(app, 'WebGL not available', 'This device or browser cannot show 3D graphics. Try another browser or turn on hardware acceleration.', false);
} else {
  try {
    new Game(app);
  } catch (err) {
    console.error(err);
    if (!app.querySelector('.fatal')) showFatal(app, 'Oops, failed to load', 'Something went wrong while starting the game. Try reloading the page.');
  }
}
