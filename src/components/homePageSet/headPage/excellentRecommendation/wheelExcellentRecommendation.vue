<script setup>
import { ref, watch } from "vue"

import { useExcellentRecommendation } from "../../../../store/excellentRecommendation"
const excellentRecommendation = useExcellentRecommendation()
excellentRecommendation.fetchExcellentRecommendation()
const props = defineProps({
  travelDistance: {
    type: Number,
    required: true,
  }
})

const albumCoverContainerRef = ref(null)

watch(() => props.travelDistance, (newValue, oldValue) => {
  albumCoverContainerRef.value.style.transform = `translateX(-${newValue * 1325}px)`
  console.log(newValue);
})

const emit = defineEmits(['passExcellentRecListsLength'])
watch(() => excellentRecommendation.loaded, () => {
  emit('passExcellentRecListsLength', {
    id: 'excellentRecommentdation',
    listLength: excellentRecommendation.listLength,
  })
})
</script>

<template>
  <div class="wheel-container">
    <div class="album-cover-container" ref="albumCoverContainerRef">
      <div class="album-item" v-for="(item, index) in excellentRecommendation.albumInfo" :key="index">
        <img class="album-img" :src="item.picUrl" alt="">
      </div>
    </div>


  </div>
</template>

<style scoped>
.wheel-container {
  margin-top: 30px;
  margin-bottom: 50px;
  overflow: hidden;
  position: relative;
  height: 300px;
  width: 1300px;
  /* background-color: antiquewhite; */
}

.album-cover-container {
  position: absolute;
  display: flex;
  transform: translateX(0px);
  transition: all 0.5s linear;
}

.album-item {

  margin-right: 30px;
  width: 635px;
  /* height: 290px; */
  aspect-ratio: auto;
  /* background-color: pink; */
}

.album-img {
  width: 100%;
  height: 100%;
}

@media screen and (max-width:450px) {
  .wheel-container {
    overflow: auto;
    width: 100vw;
  }

  .album-item {
    --padding-x: 10px;
    margin-right: 0;
    padding: 0 calc(var(--padding-x) / 2);
    width: calc(100vw - var(--padding-x));
    aspect-ratio: auto;
    /* background-color: pink; */
  }
}
</style>
