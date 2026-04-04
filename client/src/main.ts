import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createWebHistory } from 'vue-router';
import App from './App.vue';
import HomeView from './views/HomeView.vue';
import LobbyView from './views/LobbyView.vue';
import PairingView from './views/PairingView.vue';
import RaceView from './views/RaceView.vue';

const router = createRouter({
	history: createWebHistory(),
	routes: [
		{ path: '/', component: HomeView },
		{ path: '/lobby', component: LobbyView },
		{ path: '/pairing', component: PairingView },
		{ path: '/race', component: RaceView },
		{ path: '/join/:code', component: HomeView },
	],
});

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount('#app');
