import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSize, Spacing } from '../constants/theme';

interface DateRangePickerProps {
  startDate: string | null;
  endDate: string | null;
  onDateRangeChange: (start: string | null, end: string | null) => void;
  placeholder?: string;
}

export function DateRangePicker({
  startDate,
  endDate,
  onDateRangeChange,
  placeholder = 'Select Date Range',
}: DateRangePickerProps) {
  const [showModal, setShowModal] = useState(false);
  const [tempStart, setTempStart] = useState(startDate || '');
  const [tempEnd, setTempEnd] = useState(endDate || '');
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const dateToString = (date: Date) => date.toISOString().split('T')[0];
  const stringToDate = (str: string) => new Date(str + 'T00:00:00');

  const isDateInRange = (day: number) => {
    if (!tempStart || !tempEnd) return false;
    const current = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    const start = stringToDate(tempStart);
    const end = stringToDate(tempEnd);
    return current >= start && current <= end;
  };

  const isDateSelected = (day: number) => {
    const current = dateToString(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day));
    return current === tempStart || current === tempEnd;
  };

  const handleDayPress = (day: number) => {
    const selectedDate = dateToString(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day));
    if (!tempStart) {
      setTempStart(selectedDate);
    } else if (!tempEnd) {
      if (selectedDate >= tempStart) {
        setTempEnd(selectedDate);
      } else {
        setTempStart(selectedDate);
        setTempEnd('');
      }
    } else {
      setTempStart(selectedDate);
      setTempEnd('');
    }
  };

  const handleQuickSelect = (days: number | null) => {
    const end = new Date();
    const start = new Date();
    if (days) start.setDate(start.getDate() - days);
    setTempStart(dateToString(start));
    setTempEnd(dateToString(end));
  };

  const handleApply = () => {
    onDateRangeChange(tempStart || null, tempEnd || null);
    setShowModal(false);
  };

  const handleClear = () => {
    setTempStart('');
    setTempEnd('');
    onDateRangeChange(null, null);
    setShowModal(false);
  };

  const displayText = startDate && endDate
    ? `${startDate} to ${endDate}`
    : placeholder;

  const daysArray = Array.from({ length: getDaysInMonth(currentMonth) }, (_, i) => i + 1);
  const emptyDays = Array.from({ length: getFirstDayOfMonth(currentMonth) }, (_, i) => i);

  const monthYear = currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <>
      <TouchableOpacity
        style={styles.button}
        onPress={() => {
          setTempStart(startDate || '');
          setTempEnd(endDate || '');
          setShowModal(true);
        }}
        activeOpacity={0.7}
      >
        <Ionicons name="calendar" size={18} color={Colors.brand} />
        <Text style={styles.buttonText}>{displayText}</Text>
        <Ionicons name="chevron-down" size={18} color={Colors.textSecondary} />
      </TouchableOpacity>

      <Modal visible={showModal} transparent animationType="fade" onRequestClose={() => setShowModal(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setShowModal(false)}>
          <View style={styles.container}>
            <View style={styles.header}>
              <Text style={styles.title}>Select Date Range</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
              {/* Quick selects */}
              <Text style={styles.sectionTitle}>Quick Select</Text>
              <View style={styles.quickButtons}>
                <TouchableOpacity
                  style={[styles.quickBtn, tempStart && tempEnd && tempEnd === dateToString(new Date()) && (new Date().getTime() - stringToDate(tempStart).getTime()) === 0 && styles.quickBtnActive]}
                  onPress={() => handleQuickSelect(0)}
                >
                  <Text style={styles.quickBtnText}>Today</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.quickBtn, tempStart && tempEnd && (new Date().getTime() - stringToDate(tempStart).getTime()) === 7 * 24 * 60 * 60 * 1000 && styles.quickBtnActive]}
                  onPress={() => handleQuickSelect(7)}
                >
                  <Text style={styles.quickBtnText}>7 Days</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.quickBtn, tempStart && tempEnd && (new Date().getTime() - stringToDate(tempStart).getTime()) === 30 * 24 * 60 * 60 * 1000 && styles.quickBtnActive]}
                  onPress={() => handleQuickSelect(30)}
                >
                  <Text style={styles.quickBtnText}>30 Days</Text>
                </TouchableOpacity>
              </View>

              {/* Calendar */}
              <View style={styles.calendarSection}>
                <View style={styles.monthHeader}>
                  <TouchableOpacity onPress={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}>
                    <Ionicons name="chevron-back" size={24} color={Colors.brand} />
                  </TouchableOpacity>
                  <Text style={styles.monthText}>{monthYear}</Text>
                  <TouchableOpacity onPress={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}>
                    <Ionicons name="chevron-forward" size={24} color={Colors.brand} />
                  </TouchableOpacity>
                </View>

                {/* Weekdays */}
                <View style={styles.weekdaysRow}>
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                    <Text key={day} style={styles.weekdayText}>{day}</Text>
                  ))}
                </View>

                {/* Days grid */}
                <View style={styles.daysGrid}>
                  {emptyDays.map((_, i) => (
                    <View key={`empty-${i}`} style={styles.dayCell} />
                  ))}
                  {daysArray.map(day => (
                    <TouchableOpacity
                      key={day}
                      style={[
                        styles.dayCell,
                        isDateInRange(day) && styles.dayInRange,
                        isDateSelected(day) && styles.daySelected,
                      ]}
                      onPress={() => handleDayPress(day)}
                    >
                      <Text style={[styles.dayText, isDateSelected(day) && styles.dayTextSelected]}>
                        {day}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Selected dates display */}
              <View style={styles.selectedSection}>
                <View style={styles.selectedItem}>
                  <Text style={styles.selectedLabel}>From:</Text>
                  <TextInput
                    style={styles.dateInput}
                    value={tempStart}
                    onChangeText={setTempStart}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={Colors.textSecondary}
                  />
                </View>
                <View style={styles.selectedItem}>
                  <Text style={styles.selectedLabel}>To:</Text>
                  <TextInput
                    style={styles.dateInput}
                    value={tempEnd}
                    onChangeText={setTempEnd}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={Colors.textSecondary}
                  />
                </View>
              </View>
            </ScrollView>

            {/* Action buttons */}
            <View style={styles.footer}>
              <TouchableOpacity style={styles.clearBtn} onPress={handleClear} activeOpacity={0.7}>
                <Text style={styles.clearBtnText}>Clear</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.applyBtn} onPress={handleApply} activeOpacity={0.7}>
                <Text style={styles.applyBtnText}>Apply</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    marginHorizontal: Spacing.lg,
    marginVertical: 6,
  },
  buttonText: {
    flex: 1,
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.text,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: Colors.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    paddingBottom: Spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.text,
  },
  content: {
    maxHeight: '70%',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  sectionTitle: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  quickButtons: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  quickBtn: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 6,
    alignItems: 'center',
  },
  quickBtnActive: {
    backgroundColor: Colors.brand,
    borderColor: Colors.brand,
  },
  quickBtnText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.text,
  },
  calendarSection: {
    marginBottom: Spacing.lg,
  },
  monthHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  monthText: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.text,
  },
  weekdaysRow: {
    flexDirection: 'row',
    marginBottom: Spacing.sm,
  },
  weekdayText: {
    flex: 1,
    textAlign: 'center',
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.28%',
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  dayInRange: {
    backgroundColor: Colors.brand + '20',
  },
  daySelected: {
    backgroundColor: Colors.brand,
    borderRadius: 6,
  },
  dayText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.text,
  },
  dayTextSelected: {
    color: Colors.textInverse,
  },
  selectedSection: {
    marginBottom: Spacing.lg,
  },
  selectedItem: {
    marginBottom: Spacing.sm,
  },
  selectedLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  dateInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    fontSize: FontSize.sm,
    color: Colors.text,
  },
  footer: {
    flexDirection: 'row',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  clearBtn: {
    flex: 1,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    alignItems: 'center',
  },
  clearBtnText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text,
  },
  applyBtn: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: Colors.brand,
    borderRadius: 8,
    alignItems: 'center',
  },
  applyBtnText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textInverse,
  },
});
