import { useCallback, useEffect, useState } from 'react';
import { Box, Flex, Text, Badge } from '@chakra-ui/react';
import { Zap } from 'lucide-react';
import {
  getTokenPredictionAccuracy,
  type TokenOpinionSummary,
  type TokenPredictionAccuracy,
  type PublicApiConfig,
} from '@/lib/api';

type PredictionMarketProps = {
  raceCfg: PublicApiConfig;
  stats: TokenOpinionSummary;
};

export function PredictionMarket({ raceCfg, stats }: PredictionMarketProps) {
  const [accuracy, setAccuracy] = useState<TokenPredictionAccuracy | null>(null);

  // Detect dark mode
  const [isDark, setIsDark] = useState(
    () => document.documentElement.getAttribute('data-theme') !== 'light',
  );
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.getAttribute('data-theme') !== 'light');
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);

  const loadAccuracy = useCallback(async () => {
    try {
      const data = await getTokenPredictionAccuracy(raceCfg, stats.token_symbol);
      setAccuracy(data);
    } catch {
      // Endpoint not available yet — hide accuracy section
    }
  }, [raceCfg, stats.token_symbol]);

  useEffect(() => {
    void loadAccuracy();
  }, [loadAccuracy]);

  const probability = Math.max(stats.bullish_pct, stats.bearish_pct);
  const direction =
    stats.bullish_pct > stats.bearish_pct
      ? 'UP'
      : stats.bearish_pct > stats.bullish_pct
      ? 'DOWN'
      : null;
  const conviction = (probability / 100) * stats.avg_confidence * 100;

  let accuracyColor = isDark ? 'gray.400' : 'gray.500';
  if (accuracy) {
    if (accuracy.accuracy_pct > 60) accuracyColor = 'green.400';
    else if (accuracy.accuracy_pct >= 40) accuracyColor = 'yellow.400';
    else accuracyColor = 'red.400';
  }

  const bgCard = isDark ? 'gray.800' : 'gray.100';
  const borderColor = isDark ? 'gray.700' : 'gray.200';
  const textMuted = isDark ? 'gray.400' : 'gray.500';
  const textMain = isDark ? 'white' : 'gray.900';

  return (
    <Flex direction="column" gap={2}>
      <Text
        fontSize="11px"
        textTransform="uppercase"
        letterSpacing="wider"
        fontWeight="semibold"
        opacity={0.5}
        color={textMain}
      >
        Prediction Market
      </Text>

      {/* Direction card */}
      <Box bg={bgCard} borderRadius="xl" border="1px solid" borderColor={borderColor} p={3}>
        {direction ? (
          <Flex direction="column" gap={2}>
            <Flex align="center" gap={2}>
              <Box color="yellow.400" flexShrink={0}>
                <Zap size={16} />
              </Box>
              <Text fontSize="sm" fontWeight="semibold" color={textMain}>
                {stats.token_symbol} Price Direction
              </Text>
            </Flex>
            <Flex align="center" justify="space-between">
              <Text
                fontSize="xs"
                color={direction === 'UP' ? 'green.400' : 'red.400'}
              >
                Conviction {direction}
              </Text>
              <Text
                fontSize="sm"
                fontWeight="bold"
                fontFamily="mono"
                color={direction === 'UP' ? 'green.400' : 'red.400'}
              >
                {conviction.toFixed(0)}%
              </Text>
            </Flex>
            {/* Progress bar */}
            <Box h={2} borderRadius="full" overflow="hidden" bg={isDark ? 'gray.700' : 'gray.300'}>
              <Box
                h="full"
                borderRadius="full"
                bg={direction === 'UP' ? 'green.500' : 'red.500'}
                style={{ width: `${conviction}%` }}
              />
            </Box>
          </Flex>
        ) : (
          <Text fontSize="xs" opacity={0.5} color={textMuted}>
            No clear directional consensus
          </Text>
        )}
      </Box>

      {/* Historical Accuracy */}
      {accuracy && accuracy.total_predictions > 0 && (
        <Box bg={bgCard} borderRadius="xl" border="1px solid" borderColor={borderColor} p={3}>
          <Flex direction="column" gap={1}>
            <Flex align="center" justify="space-between">
              <Text
                fontSize="11px"
                textTransform="uppercase"
                letterSpacing="wider"
                opacity={0.4}
                color={textMuted}
              >
                Accuracy
              </Text>
              <Badge
                size="sm"
                variant="subtle"
                colorPalette={
                  accuracy.accuracy_pct > 60
                    ? 'green'
                    : accuracy.accuracy_pct >= 40
                    ? 'yellow'
                    : 'red'
                }
              >
                <Text fontFamily="mono" fontWeight="bold" color={accuracyColor}>
                  {accuracy.accuracy_pct.toFixed(0)}%
                </Text>
              </Badge>
            </Flex>
            <Text fontSize="10px" opacity={0.4} color={textMuted}>
              {accuracy.correct_predictions} of {accuracy.total_predictions} calls correct
            </Text>
            {accuracy.streak > 1 && (
              <Text fontSize="10px" opacity={0.4} color={textMuted}>
                On a {accuracy.streak}-call streak
              </Text>
            )}
          </Flex>
        </Box>
      )}
    </Flex>
  );
}
