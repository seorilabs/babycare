import React, {useMemo, useState} from 'react';
import {Keyboard, Pressable, StyleSheet, Text, View} from 'react-native';
import type {Strings} from '@babycare/product-ui';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;
const CALENDAR_CELL_COUNT = 42;

export type BirthDateCalendarDay = {
  readonly day: number;
  readonly isoDate: string;
  readonly disabled: boolean;
};

function calendarDateParts(value: string):
  | {readonly year: number; readonly monthIndex: number; readonly day: number}
  | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return undefined;
  }
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const parsed = new Date(year, monthIndex, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== monthIndex ||
    parsed.getDate() !== day
  ) {
    return undefined;
  }
  return {year, monthIndex, day};
}

export function formatIsoCalendarDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isSelectableBirthDate(
  value: string,
  maximumDate: Date,
): boolean {
  return (
    calendarDateParts(value) !== undefined &&
    value <= formatIsoCalendarDate(maximumDate)
  );
}

export function buildBirthDateCalendar(
  year: number,
  monthIndex: number,
  maximumDate: Date,
): readonly (BirthDateCalendarDay | undefined)[] {
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const maximumIsoDate = formatIsoCalendarDate(maximumDate);
  return Array.from({length: CALENDAR_CELL_COUNT}, (_, index) => {
    const day = index - firstWeekday + 1;
    if (day < 1 || day > daysInMonth) {
      return undefined;
    }
    const isoDate = formatIsoCalendarDate(new Date(year, monthIndex, day));
    return {day, isoDate, disabled: isoDate > maximumIsoDate};
  });
}

export function BirthDatePicker({
  value,
  onChange,
  strings,
  maximumDate = new Date(),
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly strings: Strings;
  readonly maximumDate?: Date;
}) {
  const selectedParts = calendarDateParts(value);
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(
    () =>
      new Date(
        selectedParts?.year ?? maximumDate.getFullYear(),
        selectedParts?.monthIndex ?? maximumDate.getMonth(),
        1,
      ),
  );
  const maximumMonthIndex =
    maximumDate.getFullYear() * 12 + maximumDate.getMonth();
  const visibleMonthIndex =
    visibleMonth.getFullYear() * 12 + visibleMonth.getMonth();
  const days = useMemo(
    () =>
      buildBirthDateCalendar(
        visibleMonth.getFullYear(),
        visibleMonth.getMonth(),
        maximumDate,
      ),
    [maximumDate, visibleMonth],
  );

  const moveMonth = (offset: number) => {
    const target = new Date(
      visibleMonth.getFullYear(),
      visibleMonth.getMonth() + offset,
      1,
    );
    const targetIndex = target.getFullYear() * 12 + target.getMonth();
    if (targetIndex <= maximumMonthIndex) {
      setVisibleMonth(target);
    }
  };

  const openPicker = () => {
    Keyboard.dismiss();
    setOpen(current => !current);
  };

  return (
    <>
      <Pressable
        accessibilityLabel={strings.onboarding.birthDateSelectAccessibilityLabel}
        accessibilityRole="button"
        accessibilityState={{expanded: open}}
        onPress={openPicker}
        style={({pressed}) => [styles.dateButton, pressed && styles.pressed]}>
        <Text style={value ? styles.dateValue : styles.datePlaceholder}>
          {value || strings.onboarding.birthDatePlaceholder}
        </Text>
        <Text style={styles.dateHint}>{open ? strings.common.close : strings.onboarding.birthDatePick}</Text>
      </Pressable>
      {open ? (
        <View accessibilityLabel={strings.onboarding.birthDateCalendarAccessibilityLabel} style={styles.calendar}>
          <View style={styles.calendarHeader}>
            <Pressable accessibilityLabel={strings.onboarding.birthDatePreviousYearLabel} accessibilityRole="button" onPress={() => moveMonth(-12)} style={styles.monthButton}>
              <Text style={styles.monthButtonText}>≪</Text>
            </Pressable>
            <Pressable accessibilityLabel={strings.onboarding.birthDatePreviousMonthLabel} accessibilityRole="button" onPress={() => moveMonth(-1)} style={styles.monthButton}>
              <Text style={styles.monthButtonText}>‹</Text>
            </Pressable>
            <Text style={styles.monthTitle}>
              {visibleMonth.getFullYear()}년 {visibleMonth.getMonth() + 1}월
            </Text>
            <Pressable
              accessibilityLabel={strings.onboarding.birthDateNextMonthLabel}
              accessibilityRole="button"
              accessibilityState={{disabled: visibleMonthIndex >= maximumMonthIndex}}
              disabled={visibleMonthIndex >= maximumMonthIndex}
              onPress={() => moveMonth(1)}
              style={styles.monthButton}>
              <Text style={[styles.monthButtonText, visibleMonthIndex >= maximumMonthIndex && styles.disabledText]}>›</Text>
            </Pressable>
            <Pressable
              accessibilityLabel={strings.onboarding.birthDateNextYearLabel}
              accessibilityRole="button"
              accessibilityState={{disabled: visibleMonthIndex + 12 > maximumMonthIndex}}
              disabled={visibleMonthIndex + 12 > maximumMonthIndex}
              onPress={() => moveMonth(12)}
              style={styles.monthButton}>
              <Text style={[styles.monthButtonText, visibleMonthIndex + 12 > maximumMonthIndex && styles.disabledText]}>≫</Text>
            </Pressable>
          </View>
          <View style={styles.calendarGrid}>
            {WEEKDAYS.map(day => (
              <View key={day} style={styles.dayCell}>
                <Text style={styles.weekday}>{day}</Text>
              </View>
            ))}
            {days.map((day, index) =>
              day ? (
                <Pressable
                  accessibilityLabel={`${visibleMonth.getFullYear()}년 ${visibleMonth.getMonth() + 1}월 ${day.day}일`}
                  accessibilityRole="button"
                  accessibilityState={{disabled: day.disabled, selected: day.isoDate === value}}
                  disabled={day.disabled}
                  key={day.isoDate}
                  onPress={() => {
                    onChange(day.isoDate);
                    setOpen(false);
                  }}
                  style={[styles.dayCell, styles.selectableDay, day.isoDate === value && styles.selectedDay]}>
                  <Text style={[styles.dayText, day.disabled && styles.disabledText, day.isoDate === value && styles.selectedDayText]}>
                    {day.day}
                  </Text>
                </Pressable>
              ) : (
                <View key={`empty-${index}`} style={styles.dayCell} />
              ),
            )}
          </View>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  pressed: {opacity: 0.55},
  dateButton: {minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#D5DFDB', borderRadius: 13, backgroundColor: '#FAFCFB', paddingHorizontal: 14, paddingVertical: 13},
  dateValue: {color: '#1C2925', fontSize: 16},
  datePlaceholder: {color: '#8A9A94', fontSize: 16},
  dateHint: {color: '#397663', fontSize: 14, fontWeight: '800'},
  calendar: {gap: 10, borderWidth: 1, borderColor: '#D5DFDB', borderRadius: 16, backgroundColor: '#FFFFFF', padding: 10},
  calendarHeader: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  monthButton: {width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#F1F6F4'},
  monthButtonText: {color: '#397663', fontSize: 20, fontWeight: '800'},
  monthTitle: {flex: 1, color: '#1C2925', fontSize: 16, fontWeight: '900', textAlign: 'center'},
  calendarGrid: {flexDirection: 'row', flexWrap: 'wrap'},
  dayCell: {width: '14.2857%', height: 40, alignItems: 'center', justifyContent: 'center'},
  selectableDay: {borderRadius: 20},
  selectedDay: {backgroundColor: '#397663'},
  weekday: {color: '#76867F', fontSize: 12, fontWeight: '800'},
  dayText: {color: '#31453E', fontSize: 14, fontWeight: '700'},
  selectedDayText: {color: '#FFFFFF', fontWeight: '900'},
  disabledText: {color: '#B8C2BE'},
});
