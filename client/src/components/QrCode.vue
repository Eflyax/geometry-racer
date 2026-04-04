<template>
	<canvas ref="canvas"></canvas>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import QRCode from 'qrcode';

const props = defineProps<{
	value: string;
}>();

const canvas = ref<HTMLCanvasElement | null>(null);

function render(): void {
	if (canvas.value && props.value) {
		QRCode.toCanvas(canvas.value, props.value, {
			width: 200,
			margin: 2,
			color: { dark: '#eee', light: '#1a1a2e' },
		});
	}
}

onMounted(render);
watch(() => props.value, render);
</script>
