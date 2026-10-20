import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { space, useTheme } from '../theme';
import { Notice } from './kit';

type Props = { children: ReactNode; refreshing: boolean; onRefresh: () => void; offline: boolean; actions?: ReactNode };

/** One tab's scrolling page, with pull-to-refresh and, at the bottom, the buttons that stay in reach. */
export default function TabPage({ children, refreshing, onRefresh, offline, actions }: Props) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: insets.top + space.s4, paddingHorizontal: space.gutter, paddingBottom: space.s8, gap: space.s4 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} colors={[c.primary]} />}
      >
        {offline && <Notice tone="warning" icon="offline" message="You're offline. This is what was last saved on this phone; changes need the internet." />}
        {children}
      </ScrollView>
      {actions && (
        <View style={{ flexDirection: 'row', gap: space.s3, paddingHorizontal: space.gutter, paddingVertical: space.s3, backgroundColor: c.bg }}>{actions}</View>
      )}
    </View>
  );
}
