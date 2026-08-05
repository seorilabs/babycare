import {useRef, useState} from 'react';
import {Alert, Linking, Pressable, ScrollView, Share, StyleSheet, Text, View} from 'react-native';
import type {Membership} from '@babycare/product-core';

import type {LocalSession} from '../app/session';
import type {AppTheme} from '../app/theme';

const privacyPolicyUrl = 'https://www.seorilabs.com/privacy/';

function SettingRow(props: {
  readonly icon: string;
  readonly title: string;
  readonly detail?: string;
  readonly theme: AppTheme;
  readonly onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={props.onPress ? props.title : undefined}
      accessibilityRole={props.onPress ? 'button' : undefined}
      disabled={!props.onPress}
      onPress={props.onPress}
      style={[styles.settingRow, {borderBottomColor: props.theme.colors.border}]}>
      <View style={[styles.settingIcon, {backgroundColor: props.theme.colors.surfaceMuted}]}>
        <Text style={styles.settingEmoji}>{props.icon}</Text>
      </View>
      <View style={styles.settingCopy}>
        <Text style={[styles.settingTitle, {color: props.theme.colors.text}]}>{props.title}</Text>
        {props.detail ? <Text style={[styles.settingDetail, {color: props.theme.colors.textMuted}]}>{props.detail}</Text> : null}
      </View>
      <Text style={[styles.chevron, {color: props.theme.colors.textMuted}]}>{props.onPress ? '›' : ''}</Text>
    </Pressable>
  );
}

export function MoreScreen(props: {
  readonly session: LocalSession;
  readonly theme: AppTheme;
  readonly onReset: () => Promise<void>;
  readonly memberships?: readonly Membership[];
  readonly inviteExpiresAt?: number;
  readonly onCreateInvite?: () => Promise<void>;
  readonly onRefreshMembers?: () => Promise<void>;
}) {
  const firebase = props.session.runtimeMode === 'firebase';
  const owner = props.session.membershipRole !== 'member';
  const memberships = props.memberships ?? [];
  const inviteExpired =
    firebase &&
    Boolean(props.session.inviteCode) &&
    props.inviteExpiresAt !== undefined &&
    props.inviteExpiresAt <= Date.now();
  const inviteReady =
    firebase && Boolean(props.session.inviteCode) && !inviteExpired;
  const inviteCreationInFlight = useRef(false);
  const [inviteCreationPending, setInviteCreationPending] = useState(false);

  const createInvite = () => {
    if (inviteCreationInFlight.current || !props.onCreateInvite) {
      return;
    }
    inviteCreationInFlight.current = true;
    setInviteCreationPending(true);
    let request: Promise<void>;
    try {
      request = props.onCreateInvite();
    } catch (error) {
      request = Promise.reject(error);
    }
    request
      .catch(() =>
        Alert.alert(
          '초대 코드를 만들지 못했어요',
          '연결을 확인하고 잠시 후 다시 시도해 주세요.',
        ),
      )
      .finally(() => {
        inviteCreationInFlight.current = false;
        setInviteCreationPending(false);
      });
  };

  const shareInvite = () => {
    Share.share({
      message: `함께봄 돌봄 그룹 초대 코드: ${props.session.inviteCode}`,
    }).catch(() =>
      Alert.alert(
        '초대 코드를 공유하지 못했어요',
        '기기의 공유 기능을 열지 못했어요. 다시 시도해 주세요.',
      ),
    );
  };

  const refreshMembers = () => {
    props.onRefreshMembers?.().catch(() =>
      Alert.alert(
        '구성원 목록을 새로고침하지 못했어요',
        '연결을 확인하고 다시 시도해 주세요.',
      ),
    );
  };

  const openPrivacyPolicy = () => {
    Linking.openURL(privacyPolicyUrl).catch(() =>
      Alert.alert(
        '개인정보 처리방침을 열지 못했어요',
        '인터넷 연결을 확인하고 다시 시도해 주세요.',
      ),
    );
  };

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      style={{backgroundColor: props.theme.colors.background}}>
      <Text style={[styles.title, {color: props.theme.colors.text}]}>더보기</Text>
      <Text style={[styles.subtitle, {color: props.theme.colors.textMuted}]}>그룹과 앱 설정을 관리해요</Text>

      <View style={[styles.groupCard, {backgroundColor: props.theme.colors.surface}]}>
        <View style={styles.groupHeader}>
          <View style={styles.groupCopy}>
            <Text style={[styles.groupEyebrow, {color: props.theme.colors.primary}]}>돌봄 그룹</Text>
            <Text
              numberOfLines={2}
              style={[styles.groupName, {color: props.theme.colors.text}]}>
              {props.session.babyName}이네
            </Text>
          </View>
          <View style={[styles.localBadge, {backgroundColor: props.theme.colors.surfaceMuted}]}>
            <Text style={[styles.localText, {color: props.theme.colors.textMuted}]}>
              {firebase ? '공동 기록 모드' : '로컬 개발 모드'}
            </Text>
          </View>
        </View>
        {(memberships.length > 0
          ? memberships
          : [{
              userId: props.session.caregiverId,
              displayName: props.session.caregiverName,
              membershipRole: props.session.membershipRole ?? 'owner',
            }]
        ).map((membership, index) => (
          <View
            key={membership.userId}
            style={[
              styles.member,
              {borderTopColor: props.theme.colors.border},
              index > 0 && styles.additionalMember,
            ]}>
            <View style={[styles.avatar, {backgroundColor: props.theme.colors.primary}]}>
              <Text style={styles.avatarText}>{membership.displayName.slice(0, 1)}</Text>
            </View>
            <View style={styles.memberCopy}>
              <Text style={[styles.memberName, {color: props.theme.colors.text}]}>
                {membership.displayName}
              </Text>
              <Text style={[styles.memberRole, {color: props.theme.colors.textMuted}]}>
                {membership.userId === props.session.caregiverId ? '나 · ' : ''}
                {membership.membershipRole === 'owner' ? '소유자' : '구성원'}
              </Text>
            </View>
          </View>
        ))}
        <View style={[styles.invite, {backgroundColor: props.theme.colors.primarySoft}]}>
          <View>
            <Text style={[styles.inviteLabel, {color: props.theme.colors.textMuted}]}>
              {firebase ? '양육자 초대 코드' : '초대 코드 미리보기'}
            </Text>
            <Text style={[styles.inviteCode, {color: props.theme.colors.primary}]}>
              {firebase
                ? inviteExpired
                  ? '------'
                  : props.session.inviteCode || '------'
                : props.session.inviteCode}
            </Text>
            {inviteExpired ? (
              <Text
                accessibilityLiveRegion="polite"
                style={[styles.inviteExpiry, {color: props.theme.colors.danger}]}>
                초대 코드가 만료됐어요
              </Text>
            ) : props.inviteExpiresAt !== undefined ? (
              <Text style={[styles.inviteExpiry, {color: props.theme.colors.textMuted}]}>
                {new Intl.DateTimeFormat('ko-KR', {
                  month: 'numeric',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                }).format(props.inviteExpiresAt)}까지 유효
              </Text>
            ) : null}
          </View>
          {firebase && owner ? (
            <Pressable
              accessibilityLabel={
                inviteCreationPending
                  ? '초대 코드 만드는 중'
                  : inviteReady
                    ? '초대 코드 공유'
                    : inviteExpired
                      ? '새 초대 코드 만들기'
                      : '초대 코드 만들기'
              }
              accessibilityRole="button"
              accessibilityState={{
                busy: inviteCreationPending,
                disabled: inviteCreationPending,
              }}
              disabled={inviteCreationPending}
              onPress={inviteReady ? shareInvite : createInvite}
              style={[
                styles.inviteAction,
                {borderColor: props.theme.colors.primary},
                inviteCreationPending && styles.inviteActionPending,
              ]}>
              <Text style={[styles.inviteActionText, {color: props.theme.colors.primary}]}>
                {inviteCreationPending
                  ? '만드는 중…'
                  : inviteReady
                    ? '공유'
                    : inviteExpired
                      ? '새 코드 만들기'
                      : '코드 만들기'}
              </Text>
            </Pressable>
          ) : (
            <Text style={[styles.inviteStatus, {color: props.theme.colors.textMuted}]}>
              {firebase ? '소유자만 초대할 수 있어요' : 'Firebase 연결 후 활성화'}
            </Text>
          )}
        </View>
      </View>

      <Text style={[styles.sectionLabel, {color: props.theme.colors.textMuted}]}>설정</Text>
      <View style={[styles.settings, {backgroundColor: props.theme.colors.surface}]}>
        <SettingRow detail="ml" icon="⚖️" theme={props.theme} title="단위" />
        <SettingRow detail="시스템 설정 사용" icon="◐" theme={props.theme} title="화면 모드" />
        <SettingRow
          detail={
            props.onRefreshMembers
              ? '최신 구성원 목록을 다시 확인해요'
              : firebase
                ? '공동 기록 자동 동기화'
                : '기기 로컬 저장 · 개발 모드'
          }
          icon="☁️"
          onPress={props.onRefreshMembers ? refreshMembers : undefined}
          theme={props.theme}
          title={props.onRefreshMembers ? '구성원 목록 새로고침' : '동기화 상태'}
        />
        <SettingRow detail="한국어" icon="文" theme={props.theme} title="언어" />
      </View>

      <Text style={[styles.sectionLabel, {color: props.theme.colors.textMuted}]}>데이터와 개인정보</Text>
      <View style={[styles.settings, {backgroundColor: props.theme.colors.surface}]}>
        <SettingRow
          detail="성인 양육자용 · 비의료 목적"
          icon="🔒"
          onPress={openPrivacyPolicy}
          theme={props.theme}
          title="개인정보 처리방침"
        />
      </View>

      {!firebase ? <Pressable
        onPress={() =>
          Alert.alert('로컬 데이터를 초기화할까요?', '이 기기에 저장한 모든 돌봄 기록과 프로필이 삭제됩니다.', [
            {text: '취소', style: 'cancel'},
            {
              text: '초기화',
              style: 'destructive',
              onPress: () =>
                props.onReset().catch(error =>
                  Alert.alert(
                    '초기화하지 못했어요',
                    error instanceof Error
                      ? error.message
                      : '기기 데이터를 지우지 못했습니다. 다시 시도해 주세요.',
                  ),
                ),
            },
          ])
        }
        style={[styles.reset, {borderColor: props.theme.colors.danger}]}>
        <Text style={[styles.resetText, {color: props.theme.colors.danger}]}>로컬 데이터 초기화</Text>
      </Pressable> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {paddingBottom: 34, paddingHorizontal: 18, paddingTop: 14},
  title: {fontSize: 27, fontWeight: '900', letterSpacing: -0.7},
  subtitle: {fontSize: 12, marginTop: 5},
  groupCard: {borderRadius: 20, marginTop: 20, padding: 17},
  groupHeader: {alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between'},
  groupCopy: {flex: 1, minWidth: 0},
  groupEyebrow: {fontSize: 10, fontWeight: '900', letterSpacing: 0.8},
  groupName: {fontSize: 21, fontWeight: '900', marginTop: 4},
  localBadge: {borderRadius: 999, flexShrink: 0, marginLeft: 12, paddingHorizontal: 9, paddingVertical: 6},
  localText: {fontSize: 9, fontWeight: '700'},
  member: {alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', marginTop: 16, paddingTop: 16},
  additionalMember: {marginTop: 10, paddingTop: 10},
  avatar: {alignItems: 'center', borderRadius: 20, height: 40, justifyContent: 'center', width: 40},
  avatarText: {color: '#FFFFFF', fontSize: 15, fontWeight: '900'},
  memberCopy: {flex: 1, marginLeft: 11},
  memberName: {fontSize: 14, fontWeight: '800'},
  memberRole: {fontSize: 10, marginTop: 3},
  invite: {alignItems: 'center', borderRadius: 15, flexDirection: 'row', justifyContent: 'space-between', marginTop: 15, padding: 14},
  inviteLabel: {fontSize: 9},
  inviteCode: {fontSize: 21, fontWeight: '900', letterSpacing: 3, marginTop: 3},
  inviteExpiry: {fontSize: 9, marginTop: 3},
  inviteStatus: {fontSize: 9, maxWidth: 90, textAlign: 'right'},
  inviteAction: {alignItems: 'center', borderRadius: 10, borderWidth: 1, justifyContent: 'center', minHeight: 36, paddingHorizontal: 10},
  inviteActionPending: {opacity: 0.6},
  inviteActionText: {fontSize: 10, fontWeight: '900'},
  sectionLabel: {fontSize: 11, fontWeight: '800', marginBottom: 8, marginLeft: 4, marginTop: 24},
  settings: {borderRadius: 18, overflow: 'hidden'},
  settingRow: {alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', minHeight: 68, paddingHorizontal: 14},
  settingIcon: {alignItems: 'center', borderRadius: 11, height: 38, justifyContent: 'center', width: 38},
  settingEmoji: {fontSize: 18},
  settingCopy: {flex: 1, marginLeft: 12},
  settingTitle: {fontSize: 14, fontWeight: '700'},
  settingDetail: {fontSize: 10, marginTop: 3},
  chevron: {fontSize: 22},
  reset: {alignItems: 'center', borderRadius: 15, borderWidth: 1, marginTop: 26, minHeight: 50, justifyContent: 'center'},
  resetText: {fontSize: 13, fontWeight: '800'},
});
