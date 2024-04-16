import { initViewer, loadModel } from './viewer.js';
import { initTree } from './sidebar.js';

const login = document.getElementById('login');

// const thumbnailscontainer = document.getElementById('itens-container');
// thumbnailscontainer.toggleAttribute('mouse-dragging', true);

const viewerSwitch = document.getElementById('viewer-switch');
const viewerContainer = document.getElementById('preview');
const imagesContainer  = document.getElementById('image-comparer');
viewerSwitch.addEventListener('sl-change', (ev) => {
    if(ev.target.checked){
        viewerContainer.style.visibility = 'visible';
        imagesContainer.style.visibility = 'hidden';
    }
    else{
        viewerContainer.style.visibility = 'hidden';
        imagesContainer.style.visibility = 'visible';
        NOP_VIEWER.getExtension('ImageRenderExtension').refreshImages();
    }
});
try {
    const resp = await fetch('/api/auth/profile');
    if (resp.ok) {
        // thumbnailsContainer.style.visibility = 'hidden';
        const user = await resp.json();
        login.innerText = `Logout (${user.name})`;
        login.onclick = () => window.location.replace('/api/auth/logout');
        GLOBAL_VIEWER = await initViewer(viewerContainer);
        initTree('#tree', (id) => loadModel(GLOBAL_VIEWER, window.btoa(id).replace(/=/g, '')));
    } else {
        login.innerText = 'Login';
        login.onclick = () => window.location.replace('/api/auth/login');
    }
    login.style.visibility = 'visible';
} catch (err) {
    alert('Could not initialize the application. See console for more details.');
    console.error(err);
}