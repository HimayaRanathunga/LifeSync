import { useEffect } from 'react';
import { useSharedValue, useAnimatedStyle, withDelay, withTiming, Easing } from 'react-native-reanimated';
import { motionDurations } from '../theme/motion';

/**
 * Staggered fade + slide-up entrance for list-like sequences of fields/rows/sections. Each
 * consumer mounts this once per item with that item's index; delay = baseDelay + index * stagger.
 */
export function useEntranceAnimation(index: number, baseDelay: number = 0) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      baseDelay + index * motionDurations.stagger,
      withTiming(1, { duration: motionDurations.entrance, easing: Easing.out(Easing.cubic) })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, baseDelay]);

  return useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 16 }],
  }));
}
