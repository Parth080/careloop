// CareLoop design tokens v1. All sizes are dp: body text never below 17, touch targets never below 56.
// Light and dark palettes follow the phone's setting.
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { StyleSheet, useColorScheme, type TextStyle } from 'react-native';

export const palette = {
  light: {
    bg: '#F4F1EA',
    surface: '#FFFFFF',
    surfaceSunken: '#EBE6DA',
    border: '#E3DDD0',
    borderInput: '#CFC7B6',
    divider: '#ECE7DC',
    text: '#1B2B22', // 13.2:1 on bg
    textSecondary: '#3B4A41', // 8.3:1 on bg
    textMuted: '#4A5A50', // 6.5:1 on bg
    primary: '#1F6B4A', // 6.4:1 on white
    primaryPressed: '#15513A',
    onPrimary: '#FFFFFF',
    primarySoft: '#E3EFE7',
    onPrimarySoft: '#15513A',
    danger: '#B3261E', // emergency, same in both modes; white text 6.5:1
    dangerPressed: '#8C1D18',
    onDanger: '#FFFFFF',
    dangerSoft: '#FBE4E1',
    dangerBorder: '#E8B4AE',
    onDangerSoft: '#8C1D18',
    warning: '#C98A00', // ⚠ field border
    warningSoft: '#FFF4D6',
    onWarning: '#6B4A00', // 7.4:1 on warningSoft
    info: '#2F4C8A', // ask-the-doctor
    infoSoft: '#E8EEF8',
    onInfoSoft: '#1C2E57',
    dataTaken: '#1F6B4A',
    dataSkipped: '#C98A00',
    dataNotMarked: '#D9D2C3',
    focusRing: '#F2B441',
    scrim: 'rgba(0,0,0,0.45)',
  },
  dark: {
    bg: '#0F1612',
    surface: '#18221C',
    surfaceSunken: '#222E27',
    border: '#2E3D34',
    borderInput: '#4F6156',
    divider: '#26332B',
    text: '#EEF3EF',
    textSecondary: '#C9D4CD',
    textMuted: '#A9B7AE',
    primary: '#7DD3A8',
    primaryPressed: '#5FBF91',
    onPrimary: '#0B2417',
    primarySoft: '#1D3A2B',
    onPrimarySoft: '#BDE8D1',
    danger: '#B3261E',
    dangerPressed: '#8C1D18',
    onDanger: '#FFFFFF',
    dangerSoft: '#3A1714',
    dangerBorder: '#7A2A23',
    onDangerSoft: '#FFB4AB',
    warning: '#E0A526',
    warningSoft: '#3A2D0C',
    onWarning: '#F5CF6E',
    info: '#9DB6F0',
    infoSoft: '#1A2440',
    onInfoSoft: '#D3DFFA',
    dataTaken: '#7DD3A8',
    dataSkipped: '#E0A526',
    dataNotMarked: '#3D4A42',
    focusRing: '#F2B441',
    scrim: 'rgba(0,0,0,0.6)',
  },
} as const;

export type Colors = { [K in keyof typeof palette.light]: string };

// Atkinson Hyperlegible Next, made for low vision. Hindi words fall back to the phone's own Devanagari font.
export const font = {
  regular: 'AtkinsonHyperlegibleNext_400Regular',
  semibold: 'AtkinsonHyperlegibleNext_600SemiBold',
  bold: 'AtkinsonHyperlegibleNext_700Bold',
};

export const type = {
  display: { fontSize: 40, lineHeight: 46, fontFamily: font.bold },
  title1: { fontSize: 30, lineHeight: 36, fontFamily: font.bold },
  title2: { fontSize: 26, lineHeight: 32, fontFamily: font.bold },
  title3: { fontSize: 22, lineHeight: 28, fontFamily: font.bold },
  headline: { fontSize: 21, lineHeight: 28, fontFamily: font.bold },
  button: { fontSize: 20, lineHeight: 24, fontFamily: font.bold },
  buttonSm: { fontSize: 19, lineHeight: 24, fontFamily: font.bold },
  bodyLarge: { fontSize: 19, lineHeight: 27, fontFamily: font.regular },
  body: { fontSize: 18, lineHeight: 26, fontFamily: font.regular },
  bodySmall: { fontSize: 17, lineHeight: 24, fontFamily: font.regular }, // minimum
  label: { fontSize: 17, lineHeight: 22, fontFamily: font.bold },
} satisfies Record<string, TextStyle>;

export const space = { s1: 4, s2: 8, s3: 12, s4: 16, s5: 20, s6: 24, s8: 32, s10: 40, gutter: 20 };
export const radius = { xs: 8, sm: 14, md: 16, lg: 20, xl: 24, xxl: 32, pill: 999 };
export const size = { touchMin: 56, buttonLg: 64, buttonMd: 56, tabItem: 60, badge: 32, checkbox: 32, icon: 24, iconLg: 26 };
export const border = { hairline: 1, input: 2, strong: 3 };

export const makeStyles = (c: Colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    page: { paddingHorizontal: space.gutter, paddingBottom: space.s8, gap: space.s4 },

    // Buttons
    btnPrimary: { minHeight: size.buttonLg, borderRadius: radius.md, backgroundColor: c.primary, paddingHorizontal: 20, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    btnPrimaryText: { ...type.button, color: c.onPrimary, textAlign: 'center' },
    btnSecondary: { minHeight: size.buttonMd, borderRadius: radius.md, borderWidth: border.input, borderColor: c.primary, backgroundColor: c.surface, paddingHorizontal: 20, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    btnSecondaryText: { ...type.buttonSm, color: c.primary, textAlign: 'center' },
    btnDanger: { minHeight: size.buttonLg, borderRadius: 18, backgroundColor: c.danger, paddingHorizontal: 20, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
    btnDangerText: { ...type.button, fontSize: 21, color: c.onDanger, textAlign: 'center' },
    btnQuiet: { minHeight: size.touchMin, paddingHorizontal: 12, justifyContent: 'center' },
    btnQuietText: { ...type.buttonSm, color: c.primary, textDecorationLine: 'underline' },
    btnDisabled: { backgroundColor: c.border, borderColor: c.border },
    btnDisabledText: { color: c.textSecondary },

    // Chips
    chip: { minHeight: size.touchMin, borderRadius: 28, paddingHorizontal: 18, borderWidth: border.input, borderColor: c.borderInput, backgroundColor: c.surface, flexDirection: 'row', alignItems: 'center', gap: 6 },
    chipText: { fontSize: 18, lineHeight: 22, fontFamily: font.semibold, color: c.text },
    chipOn: { backgroundColor: c.primary, borderColor: c.primary },
    chipOnText: { fontFamily: font.bold, color: c.onPrimary },
    chipTile: { minHeight: 60, borderRadius: radius.md, borderWidth: border.input, borderColor: c.borderInput, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center', flex: 1, paddingHorizontal: 8, paddingVertical: 8 },

    // Cards
    card: { backgroundColor: c.surface, borderWidth: border.hairline, borderColor: c.border, borderRadius: radius.xl, padding: 20, gap: 12 },
    cardFocus: { borderWidth: border.input, borderColor: c.primary },
    cardSoft: { backgroundColor: c.primarySoft, borderRadius: radius.lg, padding: 16 },
    cardRecord: { backgroundColor: c.surfaceSunken, borderRadius: radius.lg, padding: 16 }, // exact saved text, never rephrased
    emergencyBox: { backgroundColor: c.dangerSoft, borderWidth: border.strong, borderColor: c.danger, borderRadius: radius.xl, padding: 20, gap: 12 },
    doctorBox: { backgroundColor: c.infoSoft, borderWidth: border.input, borderColor: c.info, borderRadius: radius.xl, padding: 20, gap: 12 },
    sheet: { backgroundColor: c.surface, borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl, padding: 20, paddingBottom: 32, gap: 14 },

    // Inputs
    input: { minHeight: 56, borderRadius: radius.sm, borderWidth: border.input, borderColor: c.borderInput, backgroundColor: c.surface, paddingHorizontal: 14, paddingVertical: 12, ...type.bodyLarge, color: c.text },
    inputFocus: { borderWidth: border.strong, borderColor: c.primary },
    inputWarn: { borderWidth: border.strong, borderColor: c.warning, backgroundColor: c.warningSoft }, // ⚠ unclear field
    labelWarn: { ...type.label, color: c.onWarning },
    checkConfirm: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: c.warningSoft, borderWidth: border.input, borderColor: c.warning, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 12 },

    // Badges (always include a word; never colour alone)
    badge: { minHeight: size.badge, borderRadius: 16, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
    badgeText: { ...type.label },
    badgeTaken: { backgroundColor: c.primary }, // text onPrimary
    badgeLater: { backgroundColor: c.surfaceSunken }, // text text
    badgeSkipped: { backgroundColor: c.warningSoft }, // text onWarning
    badgeNotMarked: { borderWidth: 2, borderStyle: 'dashed', borderColor: c.textMuted },
    badgeOnlyYou: { borderWidth: 2, borderColor: c.text },

    // Tab bar item
    tabItem: { minHeight: size.tabItem, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', gap: 2, flex: 1 },
    tabItemActive: { backgroundColor: c.primarySoft },
    tabLabel: { ...type.label, fontFamily: font.semibold, color: c.textSecondary },
    tabLabelActive: { fontFamily: font.bold, color: c.onPrimarySoft },
  });

export type Theme = { c: Colors; s: ReturnType<typeof makeStyles>; dark: boolean };

function buildTheme(dark: boolean): Theme {
  const c = dark ? palette.dark : palette.light;
  return { c, s: makeStyles(c), dark };
}

const ThemeContext = createContext<Theme>(buildTheme(false));

export function ThemeProvider({ children }: { children: ReactNode }) {
  const dark = useColorScheme() === 'dark';
  const theme = useMemo(() => buildTheme(dark), [dark]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
