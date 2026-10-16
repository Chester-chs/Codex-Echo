<template>
  <image
    class="app-icon"
    :src="`/static/icons/${name}${light ? '-light' : ''}.png`"
    mode="aspectFit"
  />
</template>
<script setup>
defineProps({ name: { type: String, required: true }, light: Boolean });
</script>
