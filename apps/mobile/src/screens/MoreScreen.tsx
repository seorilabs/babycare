import {useRef, useState} from 'react';
import {Alert, Linking, Pressable, ScrollView, Share, StyleSheet, Text, View} from 'react-native';
import type {Membership} from '@babycare/product-core';

import type {Strings} from '../app/i18n';
import type {LocalSession} from '../app/session';
import type {AppTheme} from '../app/theme';

const privacyPolicyUrl = 'https://www.seorilabs.com/privacy/';

function SettingRow(props: {
  readonly icon: string;
  readonly title: string;
  readonly detail?: string;
  readonly theme: AppTheme;
  readonly onPress?: () => void;
  readonly disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityLabel={props.onPress ? props.title : undefined}
      accessibilityRole={props.onPress ? 'button' : undefined}
      accessibilityState={props.onPress ? {disabled: props.disabled ?? false} : undefined}
      disabled={!props.onPress || props.disabled}
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
  readonly strings: Strings;
  readonly theme: AppTheme;
  readonly onReset: () => Promise<void>;
  readonly memberships?: readonly Membership[];
  readonly inviteExpiresAt?: number;
  readonly onCreateInvite?: () => Promise<void>;
  readonly onRefreshMembers?: () => Promise<void>;
  readonly onDeleteAccount?: () => Promise<void>;
}) {
  const strings = props.strings;
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
  const accountDeletionInFlight = useRef(false);
  const [accountDeletionPending, setAccountDeletionPending] = useState(false);

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
          strings.more.inviteFailedTitle,
          strings.more.inviteFailedMessage,
        ),
      )
      .finally(() => {
        inviteCreationInFlight.current = false;
        setInviteCreationPending(false);
      });
  };

  const shareInvite = () => {
    Share.share({
      message: strings.more.shareMessage(props.session.inviteCode),
    }).catch(() =>
      Alert.alert(
        strings.more.shareFailedTitle,
        strings.more.shareFailedMessage,
      ),
    );
  };

  const refreshMembers = () => {
    props.onRefreshMembers?.().catch(() =>
      Alert.alert(
        strings.more.refreshMembersFailedTitle,
        strings.more.refreshMembersFailedMessage,
      ),
    );
  };

  const openPrivacyPolicy = () => {
    Linking.openURL(privacyPolicyUrl).catch(() =>
      Alert.alert(
        strings.more.privacyOpenFailedTitle,
        strings.more.privacyOpenFailedMessage,
      ),
    );
  };

  const deleteAccount = () => {
    if (!props.onDeleteAccount || accountDeletionInFlight.current) {
      return;
    }
    const consequence = owner
      ? strings.more.deleteAccountOwnerConsequence
      : strings.more.deleteAccountMemberConsequence;
    Alert.alert(
      strings.more.deleteAccountConfirmTitle,
      `${consequence}\n\n${strings.more.deleteAccountIrreversible}`,
      [
        {text: strings.common.cancel, style: 'cancel'},
        {
          text: strings.more.deleteAccountConfirmAction,
          style: 'destructive',
          onPress: () => {
            if (accountDeletionInFlight.current) {
              return;
            }
            accountDeletionInFlight.current = true;
            setAccountDeletionPending(true);
            let request: Promise<void>;
            try {
              request = props.onDeleteAccount!();
            } catch (error) {
              request = Promise.reject(error);
            }
            request
              .catch(() =>
                Alert.alert(
                  strings.more.deleteAccountFailedTitle,
                  strings.more.deleteAccountFailedMessage,
                ),
              )
              .finally(() => {
                accountDeletionInFlight.current = false;
                setAccountDeletionPending(false);
              });
          },
        },
      ],
    );
  };

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      style={{backgroundColor: props.theme.colors.background}}>
      <Text style={[styles.title, {color: props.theme.colors.text}]}>
        {strings.more.title}
      </Text>
      <Text style={[styles.subtitle, {color: props.theme.colors.textMuted}]}>
        {strings.more.subtitle}
      </Text>

      <View style={[styles.groupCard, {backgroundColor: props.theme.colors.surface}]}>
        <View style={styles.groupHeader}>
          <View style={styles.groupCopy}>
            <Text style={[styles.groupEyebrow, {color: props.theme.colors.primary}]}>
              {strings.more.groupEyebrow}
            </Text>
            <Text
              numberOfLines={2}
              style={[styles.groupName, {color: props.theme.colors.text}]}>
              {strings.more.groupName(props.session.babyName)}
            </Text>
          </View>
          <View style={[styles.localBadge, {backgroundColor: props.theme.colors.surfaceMuted}]}>
            <Text style={[styles.localText, {color: props.theme.colors.textMuted}]}>
              {firebase
                ? strings.more.sharedModeBadge
                : strings.more.localModeBadge}
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
                {membership.userId === props.session.caregiverId
                  ? strings.more.mePrefix
                  : ''}
                {membership.membershipRole === 'owner'
                  ? strings.more.roleOwner
                  : strings.more.roleMember}
              </Text>
            </View>
          </View>
        ))}
        <View style={[styles.invite, {backgroundColor: props.theme.colors.primarySoft}]}>
          <View>
            <Text style={[styles.inviteLabel, {color: props.theme.colors.textMuted}]}>
              {firebase
                ? strings.more.inviteLabel
                : strings.more.invitePreviewLabel}
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
                {strings.more.inviteExpired}
              </Text>
            ) : props.inviteExpiresAt !== undefined ? (
              <Text style={[styles.inviteExpiry, {color: props.theme.colors.textMuted}]}>
                {strings.more.inviteValidUntil(
                  new Intl.DateTimeFormat(strings.intlLocale, {
                    month: 'numeric',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  }).format(props.inviteExpiresAt),
                )}
              </Text>
            ) : null}
          </View>
          {firebase && owner ? (
            <Pressable
              accessibilityLabel={
                inviteCreationPending
                  ? strings.more.inviteCreatingLabel
                  : inviteReady
                    ? strings.more.inviteShareLabel
                    : inviteExpired
                      ? strings.more.inviteRecreateLabel
                      : strings.more.inviteCreateLabel
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
                  ? strings.more.inviteCreating
                  : inviteReady
                    ? strings.common.share
                    : inviteExpired
                      ? strings.more.inviteRecreate
                      : strings.more.inviteCreate}
              </Text>
            </Pressable>
          ) : (
            <Text style={[styles.inviteStatus, {color: props.theme.colors.textMuted}]}>
              {firebase
                ? strings.more.inviteOwnerOnly
                : strings.more.inviteLocalDisabled}
            </Text>
          )}
        </View>
      </View>

      <Text style={[styles.sectionLabel, {color: props.theme.colors.textMuted}]}>
        {strings.more.settingsSection}
      </Text>
      <View style={[styles.settings, {backgroundColor: props.theme.colors.surface}]}>
        <SettingRow
          detail={strings.more.unitDetail}
          icon="⚖️"
          theme={props.theme}
          title={strings.more.unitTitle}
        />
        <SettingRow
          detail={strings.more.appearanceDetail}
          icon="◐"
          theme={props.theme}
          title={strings.more.appearanceTitle}
        />
        <SettingRow
          detail={
            props.onRefreshMembers
              ? strings.more.syncRefreshDetail
              : firebase
                ? strings.more.syncStatusShared
                : strings.more.syncStatusLocal
          }
          icon="☁️"
          onPress={props.onRefreshMembers ? refreshMembers : undefined}
          theme={props.theme}
          title={
            props.onRefreshMembers
              ? strings.more.syncRefreshTitle
              : strings.more.syncStatusTitle
          }
        />
        <SettingRow
          detail={strings.languageName}
          icon="文"
          theme={props.theme}
          title={strings.more.languageTitle}
        />
      </View>

      <Text style={[styles.sectionLabel, {color: props.theme.colors.textMuted}]}>
        {strings.more.privacySection}
      </Text>
      <View style={[styles.settings, {backgroundColor: props.theme.colors.surface}]}>
        <SettingRow
          detail={strings.more.privacyPolicyDetail}
          icon="🔒"
          onPress={openPrivacyPolicy}
          theme={props.theme}
          title={strings.more.privacyPolicyTitle}
        />
        {firebase ? (
          <SettingRow
            detail={
              owner
                ? strings.more.deleteAccountOwnerDetail
                : strings.more.deleteAccountMemberDetail
            }
            disabled={accountDeletionPending}
            icon="⌫"
            onPress={deleteAccount}
            theme={props.theme}
            title={
              accountDeletionPending
                ? strings.more.deleteAccountPending
                : strings.more.deleteAccountTitle
            }
          />
        ) : null}
      </View>

      {!firebase ? <Pressable
        onPress={() =>
          Alert.alert(
            strings.more.resetConfirmTitle,
            strings.more.resetConfirmMessage,
            [
              {text: strings.common.cancel, style: 'cancel'},
              {
                text: strings.common.reset,
                style: 'destructive',
                onPress: () =>
                  props.onReset().catch(error =>
                    Alert.alert(
                      strings.more.resetFailedTitle,
                      error instanceof Error
                        ? error.message
                        : strings.more.resetFailedMessage,
                    ),
                  ),
              },
            ],
          )
        }
        style={[styles.reset, {borderColor: props.theme.colors.danger}]}>
        <Text style={[styles.resetText, {color: props.theme.colors.danger}]}>
          {strings.more.resetTitle}
        </Text>
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
