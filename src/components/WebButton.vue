<script>
import {h} from 'vue';
// uni-app rewrites template buttons to custom elements. Use a native H5 button
// so focus, keyboard activation, disabled state and screen-reader roles work together.
export default {
  inheritAttrs:false,
  setup(_,{attrs,slots}) { return ()=>h('button',{type:'button',...attrs},slots.default?.()); },
};
</script>
