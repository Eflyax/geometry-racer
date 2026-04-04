<template>
	<div class="overlay">
		<div
			v-for="edge in edges"
			:key="edge.tokenId"
			class="half-circle"
			:class="edge.side"
			:style="{ background: edge.color }"
		></div>
	</div>
</template>

<script setup lang="ts">
import type { PairingEdge } from 'animal-racer-shared';

defineProps<{
	edges: Array<PairingEdge>;
}>();
</script>

<style scoped>
.overlay {
	position: absolute;
	inset: 0;
	pointer-events: none;
}

.half-circle {
	position: absolute;
	width: 60px;
	height: 60px;
	border-radius: 50%;
}

.half-circle.top {
	top: -30px;
	left: 50%;
	transform: translateX(-50%);
}

.half-circle.bottom {
	bottom: -30px;
	left: 50%;
	transform: translateX(-50%);
}

.half-circle.left {
	left: -30px;
	top: 50%;
	transform: translateY(-50%);
}

.half-circle.right {
	right: -30px;
	top: 50%;
	transform: translateY(-50%);
}
</style>
