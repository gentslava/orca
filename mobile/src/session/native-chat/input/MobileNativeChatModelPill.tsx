import { useMobileColorScheme } from '../../../theme/use-mobile-color-scheme'
import { themedStyleSheet } from '../../../theme/themed-styles'
import { Pressable, Text } from 'react-native'
import { ShieldAlert, type LucideIcon } from 'lucide-react-native'
import { colors, typography } from '../../../theme/mobile-theme'

export function ModelPill({
  primary,
  secondary,
  warning,
  icon: Icon,
  accessibleName,
  disabled,
  onPress
}: {
  primary: string
  secondary: string | null
  warning: boolean
  icon?: LucideIcon
  accessibleName: string
  disabled: boolean
  onPress: () => void
}): React.JSX.Element {
  useMobileColorScheme()
  const PillIcon = Icon ?? (warning ? ShieldAlert : undefined)
  return (
    <Pressable
      accessibilityLabel={accessibleName}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={({ pressed }) => [styles.pill, pressed && !disabled && styles.pressed]}
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
    >
      {PillIcon ? (
        <PillIcon
          size={15}
          color={warning ? colors.statusAmber : disabled ? colors.textMuted : colors.textSecondary}
          strokeWidth={2.2}
        />
      ) : null}
      {!Icon ? (
        <Text style={styles.pillText} numberOfLines={1} ellipsizeMode="tail">
          <Text style={[styles.pillPrimary, disabled && styles.pillTextDisabled]}>{primary}</Text>
          {secondary ? <Text style={styles.pillSecondary}>{`  ${secondary}`}</Text> : null}
        </Text>
      ) : null}
    </Pressable>
  )
}

const styles = themedStyleSheet(() => ({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 19,
    backgroundColor: colors.composerControl
  },
  pillText: {
    flexShrink: 1,
    fontSize: typography.bodySize
  },
  pillPrimary: {
    color: colors.textPrimary,
    fontWeight: '500'
  },
  pillSecondary: {
    color: colors.textMuted
  },
  pillTextDisabled: {
    color: colors.textMuted
  },
  pressed: { opacity: 0.7 }
}))
