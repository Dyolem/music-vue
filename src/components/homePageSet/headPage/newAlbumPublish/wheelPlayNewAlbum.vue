<script setup>
import { ref, watch } from "vue"
import { useNewAlbumStore } from "../../../../store/newAlbum"
import playCover from "../../../playCover.vue"
import { useMediaQuery } from "@/utils/mediaQuery"

const newAlbum = useNewAlbumStore()
const wheelAlbumRef = ref(null)

const props = defineProps({
  renderCount: {
    type: Number,
  },
  travelDistance: {
    type: Number,
  },
})
// 获取实际歌曲图片链接
const coverUrlFormatted = (mid) => {
  return `https://y.gtimg.cn/music/photo_new/T002R300x300M000${mid}.jpg`
}

watch(
  () => props.travelDistance,
  (newValue, oldValue) => {
    wheelAlbumRef.value.style.transform = `translateX(-${newValue * 1300}px)`
    console.log(newValue)
  },
)

const jumpToBeplay = () => {}
const mediaQueryStatement = "(max-width: 450px)"
const coverSize = ref({ width: 240, height: 240 })
useMediaQuery(
  mediaQueryStatement,
  () => {
    coverSize.value = { width: 180, height: 180 }
  },
  () => {
    coverSize.value = { width: 240, height: 240 }
  },
)
// const coverSize = () => {
//   // 创建媒体查询
//   const mediaQuery = window.matchMedia('(max-width: 450px)');
//
//   // 检查当前是否匹配媒体查询
//   if (mediaQuery.matches) {
//     // 如果视口宽度小于等于 600px，执行相应逻辑
//
//     return { width: 180, height: 180 }
//   } else {
//     // 否则执行其他逻辑
//
//     return { width: 240, height: 240 }
//   }
// }
</script>

<template>
  <div class="new-album-container">
    <div class="wheel-album" ref="wheelAlbumRef">
      <div
        class="album-unit"
        v-for="(unitItem, unitIndex) in renderCount"
        :key="unitIndex"
      >
        <div
          class="album-item"
          v-for="(item, index) in newAlbum.list.slice(
            unitIndex * 10,
            (unitIndex + 1) * 10,
          )"
          :key="index"
        >
          <play-cover
            :jump-id="item.mid"
            :cover="coverUrlFormatted(item.mid)"
            :active-width-and-height="coverSize"
            @passPlaySignal="jumpToBeplay"
            :allowDetail="true"
          >
          </play-cover>
          <div class="introduce">
            <div class="album-title txt-ellipsis">
              <router-link to="" class="title-a public-a">{{
                item.name
              }}</router-link>
            </div>
            <div class="singer txt-ellipsis">
              <router-link
                class="singer-a public-a"
                to=""
                v-for="(singer, index) in item.singers"
                :key="index"
                >{{ singer.name
                }}<span v-if="index !== item.singers.length - 1"
                  >/</span
                ></router-link
              >
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.new-album-container {
  overflow: hidden;
  position: relative;
  width: 1300px;
  height: 620px;
  /* background-color: pink; */
}

.wheel-album {
  position: absolute;
  display: flex;
  transition: all 0.3s ease-in-out;
}

.album-unit {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  width: 1300px;
}

.album-item {
  margin-bottom: 70px;
  width: 240px;
  height: 240px;
  /* background-color: antiquewhite; */
}

.introduce {
  width: 240px;
  height: 40px;
  /* background-color: aquamarine; */
}

.title-a {
  color: #999999;
}

.txt-ellipsis {
  overflow: hidden;
  white-space: nowrap;
  /* 不换行 */
  text-overflow: ellipsis;
}

.public-a {
  font-size: 14px;
  cursor: pointer;
}

.public-a:hover {
  color: #31c27c;
}

@media screen and (max-width: 450px) {
  .new-album-container {
    overflow: auto;
    padding: 0 15px;
    position: relative;
    width: 100vw;
    height: 620px;
  }

  .album-unit {
    justify-content: flex-start;
  }

  .album-item {
    --album-item-width: 200px;
    margin-bottom: 70px;
    width: var(--album-item-width);
    height: var(--album-item-width);
    /* background-color: antiquewhite; */
  }

  .introduce {
    width: var(--album-item-width);
    height: 40px;
    /* background-color: aquamarine; */
  }
}
</style>
