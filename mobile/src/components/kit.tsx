// The building blocks every screen uses, drawn from the design tokens in ../theme.
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { forwardRef, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type TextProps,
  type ViewStyle,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { border, radius, size, space, type, useTheme } from '../theme';

const feather = {
  home: 'home', calendar: 'calendar', notes: 'file-text', phone: 'phone', bell: 'bell', bellOff: 'bell-off', mic: 'mic',
  ask: 'message-square', people: 'users', camera: 'camera', check: 'check', back: 'chevron-left', forward: 'chevron-right',
  down: 'chevron-down', up: 'chevron-up', close: 'x', speaker: 'volume-2', edit: 'edit-2', trash: 'trash-2', share: 'share',
  alert: 'alert-triangle', lock: 'lock', hidden: 'eye-off', plus: 'plus', more: 'more-horizontal', clipboard: 'clipboard',
  person: 'user', clock: 'clock', search: 'search', file: 'file', image: 'image', offline: 'wifi-off', skip: 'minus',
} as const;
const community = { pill: 'pill', doctor: 'stethoscope', checked: 'shield-check-outline', sparkle: 'star-four-points-outline', heart: 'heart-outline' } as const;
export type IconName = keyof typeof feather | keyof typeof community;

// Icons are decoration beside words, so screen readers skip them.
const hidden = { accessible: false, accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const };

export function Icon({ name, size: iconSize = size.icon, color }: { name: IconName; size?: number; color: string }) {
  if (name in community) {
    return <MaterialCommunityIcons name={community[name as keyof typeof community]} size={iconSize} color={color} {...hidden} />;
  }
  return <Feather name={feather[name as keyof typeof feather]} size={iconSize} color={color} {...hidden} />;
}

type Variant = keyof typeof type;
type Tone = 'text' | 'textSecondary' | 'textMuted' | 'primary' | 'onPrimary' | 'onPrimarySoft' | 'danger' | 'onDangerSoft' | 'onWarning' | 'info' | 'onInfoSoft' | 'onDanger';

/** Text in one of the type scale's styles. Large system text sizes still apply, up to half again. */
export function Txt({ v = 'body', tone = 'text', style, ...props }: TextProps & { v?: Variant; tone?: Tone }) {
  const { c } = useTheme();
  return <Text maxFontSizeMultiplier={1.5} {...props} style={[type[v], { color: c[tone] }, style]} />;
}

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'quiet' | 'info' | 'removal' | 'outlineDark' | 'warnOutline';

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  disabled?: boolean;
  grow?: boolean; // share a row equally with its neighbours
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

export function Button({ label, onPress, variant = 'primary', icon, disabled = false, grow = false, style, accessibilityLabel }: ButtonProps) {
  const { c, s, dark } = useTheme();
  const looks: Record<ButtonVariant, { box: StyleProp<ViewStyle>; text: StyleProp<TextStyle>; color: string; pressed: ViewStyle }> = {
    primary: { box: s.btnPrimary, text: s.btnPrimaryText, color: c.onPrimary, pressed: { backgroundColor: c.primaryPressed } },
    secondary: { box: s.btnSecondary, text: s.btnSecondaryText, color: c.primary, pressed: { backgroundColor: c.primarySoft } },
    danger: { box: s.btnDanger, text: s.btnDangerText, color: c.onDanger, pressed: { backgroundColor: c.dangerPressed } },
    quiet: { box: s.btnQuiet, text: s.btnQuietText, color: c.primary, pressed: { opacity: 0.6 } },
    info: { box: [s.btnPrimary, { backgroundColor: c.info }], text: s.btnPrimaryText, color: c.onPrimary, pressed: { opacity: 0.85 } },
    removal: { box: [s.btnSecondary, { borderColor: c.dangerBorder }], text: s.btnSecondaryText, color: dark ? c.onDangerSoft : c.danger, pressed: { backgroundColor: c.dangerSoft } },
    outlineDark: { box: [s.btnSecondary, { borderColor: c.text }], text: s.btnSecondaryText, color: c.text, pressed: { backgroundColor: c.surfaceSunken } },
    warnOutline: { box: [s.btnSecondary, { borderColor: c.onWarning }], text: s.btnSecondaryText, color: c.onWarning, pressed: { backgroundColor: c.warningSoft } },
  };
  const look = looks[variant];
  const color = disabled ? c.textSecondary : look.color;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        look.box,
        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
        grow && { flex: 1, paddingHorizontal: 12 },
        disabled && variant !== 'quiet' && s.btnDisabled,
        pressed && look.pressed,
        style,
      ]}
    >
      {icon && <Icon name={icon} color={color} />}
      <Text maxFontSizeMultiplier={1.4} style={[look.text, { color }]}>
        {label}
      </Text>
    </Pressable>
  );
}

/** A round button with only an icon, such as the family button on the home screen. */
export function IconButton({ icon, label, onPress, tone = 'plain' }: { icon: IconName; label: string; onPress: () => void; tone?: 'plain' | 'sunken' }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        {
          width: size.touchMin,
          height: size.touchMin,
          borderRadius: radius.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: tone === 'sunken' ? c.surfaceSunken : c.surface,
          borderWidth: tone === 'sunken' ? 0 : border.input,
          borderColor: c.border,
        },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Icon name={icon} color={c.text} />
    </Pressable>
  );
}

/** A pill button for the screen header: "Help", "Call Asha". */
export function HeaderPill({ label, icon, onPress, tone }: { label: string; icon: IconName; onPress: () => void; tone: 'danger' | 'outline' }) {
  const { c } = useTheme();
  const danger = tone === 'danger';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        {
          minHeight: size.touchMin,
          borderRadius: radius.pill,
          paddingHorizontal: 18,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          backgroundColor: danger ? c.danger : c.surface,
          borderWidth: danger ? 0 : border.input,
          borderColor: c.primary,
        },
        pressed && { opacity: 0.8 },
      ]}
    >
      <Icon name={icon} color={danger ? c.onDanger : c.primary} />
      <Text maxFontSizeMultiplier={1.3} style={[type.buttonSm, { color: danger ? c.onDanger : c.primary }]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Chip({ label, selected, onPress, icon }: { label: string; selected: boolean; onPress: () => void; icon?: IconName }) {
  const { c, s } = useTheme();
  return (
    <Pressable accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ selected }} onPress={onPress} style={[s.chip, selected && s.chipOn]}>
      {selected && <Icon name={icon ?? 'check'} size={20} color={c.onPrimary} />}
      <Text maxFontSizeMultiplier={1.4} style={[s.chipText, selected && s.chipOnText]}>
        {label}
      </Text>
    </Pressable>
  );
}

/** A choice shown as a tile, with an optional second line: "Morning / 8:00 AM". */
export function ChipTile({ label, detail, selected, onPress }: { label: string; detail?: string; selected: boolean; onPress: () => void }) {
  const { c, s } = useTheme();
  const color = selected ? c.onPrimary : c.text;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[s.chipTile, selected && s.chipOn]}
    >
      <Text maxFontSizeMultiplier={1.3} style={[type.label, { color, textAlign: 'center' }]}>
        {label}
      </Text>
      {!!detail && (
        <Text maxFontSizeMultiplier={1.3} style={[type.bodySmall, { color, textAlign: 'center' }]}>
          {detail}
        </Text>
      )}
    </Pressable>
  );
}

export function Checkbox({ label, checked, onChange, bold = false }: { label: string; checked: boolean; onChange: (checked: boolean) => void; bold?: boolean }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked }}
      onPress={() => onChange(!checked)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: size.touchMin }}
    >
      <View
        style={{
          width: size.checkbox,
          height: size.checkbox,
          borderRadius: radius.xs,
          borderWidth: border.input,
          borderColor: checked ? c.primary : c.textSecondary,
          backgroundColor: checked ? c.primary : c.surface,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {checked && <Icon name="check" size={22} color={c.onPrimary} />}
      </View>
      <Txt v={bold ? 'headline' : 'body'} style={{ flex: 1 }}>
        {label}
      </Txt>
    </Pressable>
  );
}

/** "I checked this against the photo": the confirmation every medicine from a photo needs. */
export function CheckConfirm({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  const { c, s } = useTheme();
  return (
    <Pressable accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{ checked }} onPress={() => onChange(!checked)} style={s.checkConfirm}>
      <View
        style={{
          width: size.checkbox,
          height: size.checkbox,
          borderRadius: radius.xs,
          borderWidth: border.strong,
          borderColor: checked ? c.primary : c.onWarning,
          backgroundColor: checked ? c.primary : c.surface,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {checked && <Icon name="check" size={22} color={c.onPrimary} />}
      </View>
      <Txt v="headline" tone="onWarning" style={{ flex: 1 }}>
        {label}
      </Txt>
    </Pressable>
  );
}

export type BadgeKind = 'taken' | 'later' | 'skipped' | 'notMarked' | 'due' | 'onlyYou' | 'soft' | 'outline';

export function Badge({ label, kind }: { label: string; kind: BadgeKind }) {
  const { c, s } = useTheme();
  const look: Record<BadgeKind, [StyleProp<ViewStyle>, string]> = {
    taken: [s.badgeTaken, c.onPrimary],
    later: [s.badgeLater, c.text],
    skipped: [s.badgeSkipped, c.onWarning],
    notMarked: [s.badgeNotMarked, c.text],
    due: [{ backgroundColor: c.warningSoft, borderWidth: 2, borderColor: c.warning }, c.onWarning],
    onlyYou: [s.badgeOnlyYou, c.text],
    soft: [{ backgroundColor: c.primarySoft }, c.onPrimarySoft],
    outline: [{ borderWidth: 2, borderColor: c.text }, c.text],
  };
  const [box, color] = look[kind];
  return (
    <View style={[s.badge, box]}>
      {kind === 'taken' && <Icon name="check" size={18} color={color} />}
      <Text maxFontSizeMultiplier={1.3} style={[s.badgeText, { color }]}>
        {label}
      </Text>
    </View>
  );
}

export function Card({ children, focus = false, style }: { children: ReactNode; focus?: boolean; style?: StyleProp<ViewStyle> }) {
  const { s } = useTheme();
  return <View style={[s.card, focus && s.cardFocus, style]}>{children}</View>;
}

/** A tappable card, such as one medicine in the list. */
export function PressCard({ children, onPress, label, style }: { children: ReactNode; onPress: () => void; label: string; style?: StyleProp<ViewStyle> }) {
  const { c, s } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [s.card, { flexDirection: 'row', alignItems: 'center' }, pressed && { backgroundColor: c.surfaceSunken }, style]}
    >
      <View style={{ flex: 1, gap: 4 }}>{children}</View>
      <Icon name="forward" color={c.textSecondary} />
    </Pressable>
  );
}

type FieldProps = TextInputProps & { label: string; warn?: boolean; hint?: string };

/** A labelled text box. `warn` marks a field the readers weren't sure about: ⚠ check it against the photo. */
export const Field = forwardRef<TextInput, FieldProps>(function Field({ label, warn = false, hint, style, multiline, ...props }, ref) {
  const { c, s } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 8 }}>
      <Text maxFontSizeMultiplier={1.4} style={warn ? s.labelWarn : [type.label, { color: c.text }]}>
        {warn ? `⚠ ${label} — check against the photo` : label}
      </Text>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        placeholderTextColor={c.textMuted}
        maxFontSizeMultiplier={1.4}
        multiline={multiline}
        {...props}
        onFocus={(event) => {
          setFocused(true);
          props.onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          props.onBlur?.(event);
        }}
        style={[s.input, multiline && { minHeight: 120, textAlignVertical: 'top' }, warn && s.inputWarn, focused && s.inputFocus, style]}
      />
      {!!hint && <Txt v="bodySmall" tone="textMuted">{hint}</Txt>}
    </View>
  );
});

type NoticeTone = 'info' | 'warning' | 'danger' | 'success' | 'neutral';

/** A short message in a tinted box: what happened, or what to do next. */
export function Notice({ message, tone = 'success', icon, children }: { message?: string; tone?: NoticeTone; icon?: IconName; children?: ReactNode }) {
  const { c } = useTheme();
  if (!message && !children) return null;
  const look: Record<NoticeTone, [string, string]> = {
    info: [c.infoSoft, c.onInfoSoft],
    warning: [c.warningSoft, c.onWarning],
    danger: [c.dangerSoft, c.onDangerSoft],
    success: [c.primarySoft, c.onPrimarySoft],
    neutral: [c.surfaceSunken, c.text],
  };
  const [background, color] = look[tone];
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={{ backgroundColor: background, borderRadius: radius.lg, padding: 16, flexDirection: 'row', gap: 12, alignItems: 'center' }}
    >
      {icon && <Icon name={icon} color={color} />}
      <View style={{ flex: 1, gap: 8 }}>
        {!!message && <Text maxFontSizeMultiplier={1.5} style={[type.body, { color }]}>{message}</Text>}
        {children}
      </View>
    </View>
  );
}

/** The calendar tile beside a visit: TUE / 13 / OCT. */
export function DateTile({ weekday, day, month, strong = false }: { weekday: string; day: string; month?: string; strong?: boolean }) {
  const { c } = useTheme();
  const color = strong ? c.onPrimary : c.text;
  return (
    <View
      style={{
        width: strong ? 76 : 64,
        paddingVertical: 10,
        borderRadius: radius.md,
        backgroundColor: strong ? c.primary : c.surfaceSunken,
        alignItems: 'center',
      }}
    >
      <Text style={[type.label, { color: strong ? c.onPrimary : c.primary }]}>{weekday}</Text>
      <Text style={[type.title1, { color, lineHeight: 34 }]}>{day}</Text>
      {!!month && <Text style={[type.label, { color }]}>{month}</Text>}
    </View>
  );
}

/** Equal segments, one per dose: filled for taken, amber for skipped, grey for not marked. */
export function Segments({ marks }: { marks: ('taken' | 'skipped' | 'none')[] }) {
  const { c } = useTheme();
  const colors = { taken: c.dataTaken, skipped: c.dataSkipped, none: c.dataNotMarked };
  return (
    <View style={{ flexDirection: 'row', gap: 6 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {marks.map((mark, index) => (
        <View key={index} style={{ flex: 1, height: 10, borderRadius: 5, backgroundColor: colors[mark] }} />
      ))}
    </View>
  );
}

/** One bar split by how the doses went: taken, skipped, not marked. */
export function ProportionBar({ taken, skipped, notMarked }: { taken: number; skipped: number; notMarked: number }) {
  const { c } = useTheme();
  const parts: [number, string][] = [
    [taken, c.dataTaken],
    [skipped, c.dataSkipped],
    [notMarked, c.dataNotMarked],
  ];
  return (
    <View
      style={{ flexDirection: 'row', height: 14, borderRadius: 7, overflow: 'hidden', backgroundColor: c.dataNotMarked, gap: 2 }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {parts.filter(([count]) => count > 0).map(([count, color], index) => (
        <View key={index} style={{ flex: count, backgroundColor: color }} />
      ))}
    </View>
  );
}

export function Divider() {
  const { c } = useTheme();
  return <View style={{ height: 1, backgroundColor: c.divider }} />;
}

/** The top of a full screen: a back arrow, the title, and an optional action on the right. */
export function ScreenHeader({ title, onBack, backLabel = 'Back', right }: { title?: string; onBack?: () => void; backLabel?: string; right?: ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, minHeight: 64 }}>
      {onBack && (
        <Pressable accessibilityRole="button" accessibilityLabel={backLabel} onPress={onBack} style={{ width: size.touchMin, height: size.touchMin, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="back" size={30} color={c.text} />
        </Pressable>
      )}
      <View style={{ flex: 1, paddingLeft: onBack ? 0 : 12 }}>
        {!!title && (
          <Txt v="title2" accessibilityRole="header" numberOfLines={2}>
            {title}
          </Txt>
        )}
      </View>
      {right}
    </View>
  );
}

/** A round "close" button for the top right of a screen or sheet. */
export function CloseButton({ onPress, label = 'Close' }: { onPress: () => void; label?: string }) {
  return <IconButton icon="close" label={label} onPress={onPress} tone="sunken" />;
}

type ModalScreenProps = {
  visible?: boolean;
  onClose: () => void;
  title?: string;
  header?: ReactNode; // replaces the standard header
  right?: ReactNode;
  back?: boolean;
  footer?: ReactNode;
  scrollKey?: string | number; // when it changes, the page scrolls back to the top
  children: ReactNode;
};

/** A full screen that slides over the tabs: New note, Ask CareLoop, the summary and the forms. */
// On Android a full screen stays inside the status and navigation bars, so the window still shrinks for the
// keyboard: drawing edge to edge there would leave the keyboard covering the text boxes.
const IOS = Platform.OS === 'ios';

export function ModalScreen({ visible = true, onClose, title, header, right, back = true, footer, scrollKey, children }: ModalScreenProps) {
  const { c } = useTheme();
  const safe = useSafeAreaInsets();
  const insets = IOS ? safe : { top: 0, bottom: 0 };
  const scroller = useRef<ScrollView>(null);
  useEffect(() => {
    scroller.current?.scrollTo({ y: 0, animated: false });
  }, [scrollKey]);
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
        <KeyboardAvoidingView behavior={IOS ? 'padding' : undefined} style={{ flex: 1 }}>
          {header ?? <ScreenHeader title={title} onBack={back ? onClose : undefined} right={right} />}
          <ScrollView
            ref={scroller}
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: space.gutter, paddingTop: space.s2, paddingBottom: space.s8, gap: space.s5 }}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
          {footer && (
            <View style={{ paddingHorizontal: space.gutter, paddingTop: space.s3, paddingBottom: space.s4 + insets.bottom, gap: space.s3, backgroundColor: c.bg, borderTopWidth: 1, borderTopColor: c.divider }}>
              {footer}
            </View>
          )}
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

/** Run an action once a screen or sheet has finished sliding: iOS can't show a new one while another is still moving. */
export function afterTransition(action: () => void) {
  setTimeout(action, Platform.OS === 'ios' ? 500 : 0);
}

/** A sheet that rises from the bottom over a dimmed screen, for a few actions on one item. */
export function Sheet({ visible, onClose, title, subtitle, children }: { visible: boolean; onClose: () => void; title: string; subtitle?: ReactNode; children: ReactNode }) {
  const { c, s } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <Pressable accessibilityLabel="Close" style={{ flex: 1, backgroundColor: c.scrim }} onPress={onClose} />
      <View style={[s.sheet, { paddingBottom: 32 + insets.bottom, maxHeight: height * 0.88 }]}>
        <View style={{ alignSelf: 'center', width: 48, height: 5, borderRadius: 3, backgroundColor: c.borderInput }} />
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
          <Txt v="title2" accessibilityRole="header" style={{ flex: 1 }}>
            {title}
          </Txt>
          <CloseButton onPress={onClose} />
        </View>
        {/* Long notes and large text sizes still leave every action within reach. */}
        <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 14 }} keyboardShouldPersistTaps="handled">
          {subtitle}
          {children}
        </ScrollView>
      </View>
    </Modal>
  );
}

/** A heading inside a screen. */
export function Section({ title, detail, right, children }: { title: string; detail?: string; right?: ReactNode; children?: ReactNode }) {
  return (
    <View style={{ gap: space.s3 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt v="title3" accessibilityRole="header">
            {title}
          </Txt>
          {!!detail && <Txt v="bodySmall" tone="textMuted">{detail}</Txt>}
        </View>
        {right}
      </View>
      {children}
    </View>
  );
}

/** A row that expands to show more, such as "Past visits (1)". */
export function Expander({ label, expanded, onToggle, count }: { label: string; expanded: boolean; onToggle: () => void; count?: number | string }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={count !== undefined ? `${label}, ${count}` : label}
      accessibilityState={{ expanded }}
      onPress={onToggle}
      style={{ flexDirection: 'row', alignItems: 'center', minHeight: size.touchMin, gap: 8 }}
    >
      <Txt v="headline" tone="primary" style={{ flex: 1 }}>
        {label}
      </Txt>
      {count !== undefined && <Txt v="body" tone="textMuted">{count}</Txt>}
      <Icon name={expanded ? 'up' : 'down'} color={c.primary} />
    </Pressable>
  );
}

/** The footer note about where words go and who sees them. */
export function PrivacyLine({ text }: { text: string }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <Icon name="lock" size={22} color={c.textMuted} />
      <Txt v="bodySmall" tone="textMuted" style={{ flex: 1 }}>
        {text}
      </Txt>
    </View>
  );
}
