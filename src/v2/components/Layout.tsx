import type { ReactNode } from 'react';
import {
  Box,
  Flex,
  Container,
  Button,
  HStack,
  IconButton,
  Text,
  Link,
} from '@chakra-ui/react';
import { Sun, Moon } from 'lucide-react';
import { TonConnectButton } from '@tonconnect/ui-react';

const ASCII_LOGO = `    _                   _    __  __ \n   / \\    __ _  _ __   | |_ |  \\/  |\n  / _ \\  / _\` || '_ \\  | __|| |\\/| |\n / ___ \\| (_| || | | | | |_ | |  | |\n/_/   \\_\\\\__, ||_| |_|  \\__||_|  |_|\n          |___/`;

type NavPage = 'home' | 'agent-hub' | 'stats' | 'trader' | 'docs' | 'leaderboard';

interface NavLink {
  label: string;
  page: NavPage;
}

const NAV_LINKS: NavLink[] = [
  { label: 'Home', page: 'home' },
  { label: 'Agent Hub', page: 'agent-hub' },
  { label: 'Order Book', page: 'stats' },
  { label: 'My Agents', page: 'trader' },
];

interface LayoutProps {
  children: ReactNode;
  currentPage: NavPage;
  onNavigate: (page: NavPage) => void;
  colorMode: 'light' | 'dark';
  onToggleColorMode: () => void;
}

export function Layout({
  children,
  currentPage,
  onNavigate,
  colorMode,
  onToggleColorMode,
}: LayoutProps) {
  const isDark = colorMode === 'dark';

  return (
    <Box minH="100dvh" display="flex" flexDirection="column" bg={isDark ? 'gray.950' : 'gray.50'}>
      {/* Beta notice banner */}
      <Box
        w="full"
        bg={isDark ? 'yellow.900' : 'yellow.50'}
        borderBottom="1px solid"
        borderColor={isDark ? 'yellow.700' : 'yellow.200'}
        py={1.5}
        px={4}
        textAlign="center"
      >
        <Text fontSize="xs" color={isDark ? 'yellow.200' : 'yellow.800'}>
          <Text as="span" fontWeight="semibold">Beta Notice:</Text>{' '}
          We are currently in Beta. Please use with caution and remember — trade at your own risk, even with AI.
        </Text>
      </Box>

      {/* Navbar */}
      <Container maxW="6xl" px={{ base: 4, sm: 6 }}>
        <Flex
          as="header"
          pt={6}
          pb={3}
          align={{ base: 'flex-start', sm: 'center' }}
          direction={{ base: 'column', sm: 'row' }}
          gap={3}
        >
          {/* ASCII logo */}
          <Box flex="1">
            <Box
              as="pre"
              fontSize={{ base: '6px', sm: '8px' }}
              fontFamily="mono"
              userSelect="none"
              opacity={0.8}
              letterSpacing="-0.5px"
              lineHeight="1.3"
              cursor="pointer"
              onClick={() => onNavigate('home')}
              color={isDark ? 'brand.400' : 'brand.600'}
            >
              {ASCII_LOGO}
            </Box>
          </Box>

          {/* Nav links + controls */}
          <HStack gap={1} flexWrap="nowrap" overflowX="auto">
            {NAV_LINKS.map(({ label, page }) => (
              <Button
                key={page}
                size="sm"
                variant={currentPage === page ? 'solid' : 'ghost'}
                colorPalette={currentPage === page ? 'brand' : undefined}
                onClick={() => onNavigate(page)}
                flexShrink={0}
                color={
                  currentPage === page
                    ? undefined
                    : isDark
                    ? 'gray.300'
                    : 'gray.700'
                }
              >
                {label}
              </Button>
            ))}

            {/* Theme toggle */}
            <IconButton
              aria-label="Toggle color mode"
              size="sm"
              variant="ghost"
              onClick={onToggleColorMode}
              flexShrink={0}
              color={isDark ? 'gray.300' : 'gray.700'}
            >
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
            </IconButton>

            {/* TonConnect */}
            <Box flexShrink={0}>
              <TonConnectButton />
            </Box>
          </HStack>
        </Flex>
      </Container>

      {/* Main content */}
      <Box as="main" flex="1">
        <Container maxW="6xl" px={{ base: 4, sm: 6 }} pb={10} pt={6}>
          {children}
        </Container>
      </Box>

      {/* Footer */}
      <Box
        as="footer"
        borderTop="1px solid"
        borderColor={isDark ? 'gray.800' : 'gray.200'}
        py={6}
      >
        <Container maxW="6xl" px={{ base: 4, sm: 6 }}>
          <Flex
            direction={{ base: 'column', sm: 'row' }}
            align="center"
            justify="space-between"
            gap={3}
          >
            <Text fontSize="xs" opacity={0.4} color={isDark ? 'white' : 'black'}>
              Build on TON 💎
            </Text>
            <HStack gap={4} opacity={0.4}>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => onNavigate('docs')}
                color={isDark ? 'white' : 'black'}
                textDecoration="underline"
                textUnderlineOffset="4px"
              >
                Docs
              </Button>
              <Link
                href="https://github.com/tongateway/orderbook-protocol"
                target="_blank"
                rel="noreferrer"
                fontSize="xs"
                color={isDark ? 'white' : 'black'}
              >
                Orderbook Protocol
              </Link>
              <Link
                href="https://github.com/tongateway/agentmeme.ai"
                target="_blank"
                rel="noreferrer"
                fontSize="xs"
                color={isDark ? 'white' : 'black'}
              >
                App
              </Link>
              <Link
                href="https://github.com/tongateway/agentmeme-ai-backend-go"
                target="_blank"
                rel="noreferrer"
                fontSize="xs"
                color={isDark ? 'white' : 'black'}
              >
                Backend
              </Link>
            </HStack>
          </Flex>
        </Container>
      </Box>
    </Box>
  );
}
