/**
 * Compact month calendar. Highlights days that have events and reports the
 * selected day back to the parent. Pure date-fns, no external calendar dep.
 */
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { Pressable, View } from "react-native";

import { useTheme } from "@/theme";
import { IconButton, Row, Text } from "./ui";

const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];

export function MonthCalendar({
  eventDates,
  selected,
  onSelect,
}: {
  eventDates: Date[];
  selected: Date | null;
  onSelect: (d: Date | null) => void;
}) {
  const { colors, radius, spacing } = useTheme();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [month]);

  const hasEvent = (d: Date) => eventDates.some((e) => isSameDay(e, d));

  return (
    <View style={{ gap: spacing.sm }}>
      <Row align="space-between">
        <IconButton onPress={() => setMonth(subMonths(month, 1))}>
          <ChevronLeft size={20} color={colors.text} />
        </IconButton>
        <Text weight="bold">{format(month, "MMMM yyyy")}</Text>
        <IconButton onPress={() => setMonth(addMonths(month, 1))}>
          <ChevronRight size={20} color={colors.text} />
        </IconButton>
      </Row>
      <Row>
        {WEEKDAYS.map((w, i) => (
          <View key={i} style={{ flex: 1, alignItems: "center" }}>
            <Text variant="tertiary">{w}</Text>
          </View>
        ))}
      </Row>
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {days.map((d) => {
          const inMonth = isSameMonth(d, month);
          const isSelected = selected && isSameDay(d, selected);
          const event = hasEvent(d);
          return (
            <Pressable
              key={d.toISOString()}
              onPress={() => onSelect(isSelected ? null : d)}
              style={{ width: `${100 / 7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center", padding: 2 }}
            >
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: radius.md,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: isSelected ? colors.primary : "transparent",
                }}
              >
                <Text color={isSelected ? colors.onPrimary : inMonth ? colors.text : colors.textTertiary}>{format(d, "d")}</Text>
              </View>
              {event ? <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: isSelected ? colors.primary : colors.info, marginTop: 1 }} /> : <View style={{ height: 6 }} />}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
