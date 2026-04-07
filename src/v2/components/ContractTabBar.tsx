import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Flex, Text, Input, Icon, Spinner } from '@chakra-ui/react';
import { Plus, Bot } from 'lucide-react';
import type { ContractListItem } from '@/lib/api';

export type TabKey = { kind: 'contract'; contractId: string } | { kind: 'deploy' };

export function tabEquals(a: TabKey, b: TabKey): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'deploy') return true;
  return (a as { kind: 'contract'; contractId: string }).contractId ===
    (b as { kind: 'contract'; contractId: string }).contractId;
}

type ContractTabBarProps = {
  contracts: ContractListItem[] | null;
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  loading: boolean;
  onRename?: (contractId: string, newName: string) => Promise<void>;
  isDark: boolean;
};

function fmtAddrShort(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}\u2026${addr.slice(-4)}`;
}

export function ContractTabBar({ contracts, activeTab, onTabChange, loading, onRename, isDark }: ContractTabBarProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  const startEditing = useCallback((c: ContractListItem) => {
    setEditingId(c.id);
    setEditValue((c.name && c.name.trim()) || '');
  }, []);

  const commitRename = useCallback(async () => {
    if (!editingId || !onRename) {
      setEditingId(null);
      return;
    }
    const trimmed = editValue.trim();
    if (trimmed) {
      try {
        await onRename(editingId, trimmed);
      } catch {
        // silently fail
      }
    }
    setEditingId(null);
  }, [editingId, editValue, onRename]);

  const cancelEditing = useCallback(() => {
    setEditingId(null);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void commitRename();
      } else if (e.key === 'Escape') {
        cancelEditing();
      }
    },
    [commitRename, cancelEditing],
  );

  const bg = isDark ? 'gray.900' : 'gray.200';
  const activeBg = isDark ? 'gray.700' : 'white';
  const hoverBg = isDark ? 'gray.800' : 'gray.100';
  const textColor = isDark ? 'white' : 'gray.800';

  return (
    <Flex
      ref={scrollRef}
      display="inline-flex"
      maxW="full"
      align="center"
      gap={0}
      overflowX="auto"
      borderRadius="xl"
      bg={bg}
      p={1}
      shadow="md"
      css={{ scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } }}
    >
      {loading && !contracts?.length ? (
        <Flex align="center" gap={1.5} px={3} py={1} flexShrink={0} opacity={0.5}>
          <Spinner size="xs" />
          <Text fontSize="xs" color={textColor}>Loading...</Text>
        </Flex>
      ) : null}

      {contracts?.map((c) => {
        const isActive = activeTab.kind === 'contract' && activeTab.contractId === c.id;
        const isEditing = editingId === c.id;

        return (
          <Box
            as="button"
            key={c.id}
            display="flex"
            alignItems="center"
            gap={1.5}
            px={3}
            py={1.5}
            borderRadius="lg"
            fontSize="xs"
            fontWeight="medium"
            flexShrink={0}
            bg={isActive ? activeBg : 'transparent'}
            shadow={isActive ? 'sm' : undefined}
            color={textColor}
            cursor="pointer"
            _hover={{ bg: isActive ? activeBg : hoverBg }}
            transition="all 0.15s"
            onClick={() => onTabChange({ kind: 'contract', contractId: c.id })}
            onDoubleClick={(e: React.MouseEvent) => {
              if (isActive && onRename) {
                e.preventDefault();
                startEditing(c);
              }
            }}
          >
            <Icon as={Bot} boxSize={3.5} opacity={0.5} flexShrink={0} />
            {isEditing ? (
              <Input
                ref={inputRef}
                size="xs"
                fontFamily="mono"
                fontSize="xs"
                w="28"
                bg={isDark ? 'gray.800' : 'white'}
                borderColor={isDark ? 'gray.600' : 'gray.300'}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={() => void commitRename()}
                onKeyDown={handleKeyDown}
                onClick={(e) => e.stopPropagation()}
                maxLength={40}
                placeholder="Agent name"
              />
            ) : (
              <Text fontFamily="mono" fontSize="xs">
                {(c.name && c.name.trim()) || fmtAddrShort(c.address)}
              </Text>
            )}
            <Box
              w={2}
              h={2}
              borderRadius="full"
              flexShrink={0}
              bg={
                c.status === 'deploying' ? 'yellow.400' :
                c.status === 'paused' ? (isDark ? 'gray.600' : 'gray.400') :
                'green.400'
              }
              animation={c.status === 'deploying' ? 'pulse 2s infinite' : undefined}
              title={(c.status ?? 'active').toUpperCase()}
            />
            {c.trading_pairs && (
              <Text fontSize="10px" opacity={0.4}>{c.trading_pairs}</Text>
            )}
          </Box>
        );
      })}

      <Box
        as="button"
        display="flex"
        alignItems="center"
        gap={1.5}
        px={3}
        py={1.5}
        borderRadius="lg"
        fontSize="xs"
        fontWeight="medium"
        flexShrink={0}
        bg={activeTab.kind === 'deploy' ? activeBg : 'transparent'}
        shadow={activeTab.kind === 'deploy' ? 'sm' : undefined}
        color={textColor}
        cursor="pointer"
        _hover={{ bg: activeTab.kind === 'deploy' ? activeBg : hoverBg }}
        transition="all 0.15s"
        onClick={() => onTabChange({ kind: 'deploy' })}
        aria-label="Deploy new agent"
      >
        <Icon as={Plus} boxSize={4} />
        <Text fontSize="xs">Deploy new</Text>
      </Box>
    </Flex>
  );
}
