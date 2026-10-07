import { MoonIcon, SunIcon } from '@radix-ui/react-icons';
import { Flex, Heading, IconButton, Text, Tooltip } from '@radix-ui/themes';

interface Props {
  appearance: 'light' | 'dark';
  onToggleAppearance: () => void;
}

export function TopBar({ appearance, onToggleAppearance }: Props) {
  const label = appearance === 'dark' ? '切换到浅色模式' : '切换到深色模式';
  return (
    <header className="topbar">
      <Flex align="center" gap="2">
        <img src="/favicon.svg" width="24" height="24" alt="" />
        <Heading as="h1" size="4" weight="medium">
          Quietfox Mail
        </Heading>
        <Text size="2" color="gray" className="hide-sm">
          临时邮箱
        </Text>
      </Flex>
      <Tooltip content={label}>
        <IconButton variant="ghost" color="gray" size="2" aria-label={label} onClick={onToggleAppearance}>
          {appearance === 'dark' ? <SunIcon /> : <MoonIcon />}
        </IconButton>
      </Tooltip>
    </header>
  );
}
