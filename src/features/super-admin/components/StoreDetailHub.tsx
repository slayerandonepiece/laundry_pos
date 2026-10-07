'use client';

import { useState, useEffect, useCallback } from 'react';
import StoreDetailShell from './StoreDetailShell';
import StoreOverviewTab from './StoreOverviewTab';
import StoreOutletsTab from './StoreOutletsTab';
import StoreUsersTab from './StoreUsersTab';
import StoreSubscriptionTab from './StoreSubscriptionTab';
import StoreActivityTab from './StoreActivityTab';
import StorePaymentsTab from './StorePaymentsTab';
import StoreMessagesTab from './StoreMessagesTab';
import { TableSkeleton, TimelineSkeleton, TabContentSkeleton } from './Shimmer';
import {
  fetchStoreOverviewDataAction,
  fetchStoreOutletsDataAction,
  fetchStorePeopleDataAction,
  fetchStoreSubscriptionDataAction,
  fetchStoreActivityDataAction,
  fetchStorePaymentsDataAction,
  fetchStoreMessagesDataAction,
  type OverviewTabData,
  type OutletsTabData,
  type PeopleTabData,
  type SubscriptionTabData,
  type ActivityTabData,
  type PaymentsTabData,
  type MessagesTabData,
} from '../actions/store-tabs.actions';
import type { StoreDetail } from '../types';

export type OrgTabKey = 'overview' | 'outlets' | 'users' | 'subscription' | 'payments' | 'messages' | 'activity';

interface TabCache {
  overview?: OverviewTabData;
  outlets?: OutletsTabData;
  users?: PeopleTabData;
  subscription?: SubscriptionTabData;
  payments?: PaymentsTabData;
  messages?: MessagesTabData;
  activity?: ActivityTabData;
}

const TAB_URL_SUFFIX: Record<OrgTabKey, string> = {
  overview: '',
  outlets: '/outlets',
  users: '/users',
  subscription: '/subscription',
  payments: '/payments',
  messages: '/messages',
  activity: '/activity',
};

function getTabKeyFromPath(pathname: string): OrgTabKey {
  if (pathname.endsWith('/outlets')) return 'outlets';
  if (pathname.endsWith('/users')) return 'users';
  if (pathname.endsWith('/subscription')) return 'subscription';
  if (pathname.endsWith('/payments')) return 'payments';
  if (pathname.endsWith('/messages')) return 'messages';
  if (pathname.endsWith('/activity')) return 'activity';
  return 'overview';
}

export default function StoreDetailHub({
  store,
  lifecycleBadge,
  memberCount,
  initialTab,
  initialOverview,
  initialOutlets,
  initialPeople,
  initialSubscription,
  initialPayments,
  initialMessages,
  initialActivity,
}: {
  store: StoreDetail;
  lifecycleBadge: { label: string; badgeClass: 'good' | 'warm' | 'bad' | 'info' | 'gray' };
  memberCount?: number;
  initialTab: OrgTabKey;
  initialOverview?: OverviewTabData;
  initialOutlets?: OutletsTabData;
  initialPeople?: PeopleTabData;
  initialSubscription?: SubscriptionTabData;
  initialPayments?: PaymentsTabData;
  initialMessages?: MessagesTabData;
  initialActivity?: ActivityTabData;
}) {
  const [activeTab, setActiveTab] = useState<OrgTabKey>(initialTab);
  const [loadingTab, setLoadingTab] = useState<OrgTabKey | null>(null);
  const storageKey = `storeops_org_tab_cache_${store.id}`;

  const [tabCache, setTabCache] = useState<TabCache>(() => {
    const init: TabCache = {};
    if (initialOverview) init.overview = initialOverview;
    if (initialOutlets) init.outlets = initialOutlets;
    if (initialPeople) init.users = initialPeople;
    if (initialSubscription) init.subscription = initialSubscription;
    if (initialPayments) init.payments = initialPayments;
    if (initialMessages) init.messages = initialMessages;
    if (initialActivity) init.activity = initialActivity;
    if (typeof window !== 'undefined') {
      try {
        const saved = sessionStorage.getItem(`storeops_org_tab_cache_${store.id}`);
        if (saved) {
          const parsed = JSON.parse(saved) as TabCache;
          return { ...parsed, ...init };
        }
      } catch {}
    }
    return init;
  });

  // Save cache updates to sessionStorage
  const updateCache = useCallback((updater: (prev: TabCache) => TabCache) => {
    setTabCache(prev => {
      const next = updater(prev);
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, [storageKey]);

  // Adjust tabCache when incoming fresh server props change (React-recommended pattern instead of useEffect)
  const [prevOutlets, setPrevOutlets] = useState(initialOutlets);
  if (initialOutlets !== prevOutlets) {
    setPrevOutlets(initialOutlets);
    if (initialOutlets) setTabCache(c => ({ ...c, outlets: initialOutlets }));
  }

  const [prevOverview, setPrevOverview] = useState(initialOverview);
  if (initialOverview !== prevOverview) {
    setPrevOverview(initialOverview);
    if (initialOverview) setTabCache(c => ({ ...c, overview: initialOverview }));
  }

  const [prevPeople, setPrevPeople] = useState(initialPeople);
  if (initialPeople !== prevPeople) {
    setPrevPeople(initialPeople);
    if (initialPeople) setTabCache(c => ({ ...c, users: initialPeople }));
  }

  const [prevSubscription, setPrevSubscription] = useState(initialSubscription);
  if (initialSubscription !== prevSubscription) {
    setPrevSubscription(initialSubscription);
    if (initialSubscription) setTabCache(c => ({ ...c, subscription: initialSubscription }));
  }

  const [prevPayments, setPrevPayments] = useState(initialPayments);
  if (initialPayments !== prevPayments) {
    setPrevPayments(initialPayments);
    if (initialPayments) setTabCache(c => ({ ...c, payments: initialPayments }));
  }

  const [prevMessages, setPrevMessages] = useState(initialMessages);
  if (initialMessages !== prevMessages) {
    setPrevMessages(initialMessages);
    if (initialMessages) setTabCache(c => ({ ...c, messages: initialMessages }));
  }

  const [prevActivity, setPrevActivity] = useState(initialActivity);
  if (initialActivity !== prevActivity) {
    setPrevActivity(initialActivity);
    if (initialActivity) setTabCache(c => ({ ...c, activity: initialActivity }));
  }

  // Listen to browser Back/Forward popstate
  useEffect(() => {
    const handlePopState = () => {
      const target = getTabKeyFromPath(window.location.pathname);
      setActiveTab(target);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Fetch uncached tab data
  const loadTab = useCallback(async (tab: OrgTabKey) => {
    if (tabCache[tab]) return;
    setLoadingTab(tab);
    try {
      switch (tab) {
        case 'overview': {
          const data = await fetchStoreOverviewDataAction(store.id);
          updateCache(c => ({ ...c, overview: data }));
          break;
        }
        case 'outlets': {
          const data = await fetchStoreOutletsDataAction(store.id);
          updateCache(c => ({ ...c, outlets: data }));
          break;
        }
        case 'users': {
          const data = await fetchStorePeopleDataAction(store.id);
          updateCache(c => ({ ...c, users: data }));
          break;
        }
        case 'subscription': {
          const data = await fetchStoreSubscriptionDataAction(store.id);
          updateCache(c => ({ ...c, subscription: data }));
          break;
        }
        case 'payments': {
          const data = await fetchStorePaymentsDataAction(store.id);
          updateCache(c => ({ ...c, payments: data }));
          break;
        }
        case 'messages': {
          const data = await fetchStoreMessagesDataAction(store.id);
          updateCache(c => ({ ...c, messages: data }));
          break;
        }
        case 'activity': {
          const data = await fetchStoreActivityDataAction(store.id);
          updateCache(c => ({ ...c, activity: data }));
          break;
        }
      }
    } catch (e) {
      console.error(`Failed to load tab ${tab}:`, e);
    } finally {
      setLoadingTab(null);
    }
  }, [store.id, tabCache, updateCache]);

  const refreshTab = useCallback(async (tab: OrgTabKey) => {
    setLoadingTab(tab);
    try {
      switch (tab) {
        case 'overview': {
          const data = await fetchStoreOverviewDataAction(store.id);
          updateCache(c => ({ ...c, overview: data }));
          break;
        }
        case 'outlets': {
          const data = await fetchStoreOutletsDataAction(store.id);
          updateCache(c => ({ ...c, outlets: data }));
          break;
        }
        case 'users': {
          const data = await fetchStorePeopleDataAction(store.id);
          updateCache(c => ({ ...c, users: data }));
          break;
        }
        case 'subscription': {
          const data = await fetchStoreSubscriptionDataAction(store.id);
          updateCache(c => ({ ...c, subscription: data }));
          break;
        }
        case 'payments': {
          const data = await fetchStorePaymentsDataAction(store.id);
          updateCache(c => ({ ...c, payments: data }));
          break;
        }
        case 'messages': {
          const data = await fetchStoreMessagesDataAction(store.id);
          updateCache(c => ({ ...c, messages: data }));
          break;
        }
        case 'activity': {
          const data = await fetchStoreActivityDataAction(store.id);
          updateCache(c => ({ ...c, activity: data }));
          break;
        }
      }
    } catch (e) {
      console.error(`Failed to refresh tab ${tab}:`, e);
    } finally {
      setLoadingTab(null);
    }
  }, [store.id, updateCache]);

  // Re-reads a tab's data after the tab itself saved a change. It must not raise the loading
  // state: that swaps the tab for a skeleton, which would wipe the "Saved" confirmation.
  const refreshQuiet = useCallback(async (tab: 'payments' | 'messages') => {
    try {
      if (tab === 'payments') {
        const data = await fetchStorePaymentsDataAction(store.id);
        updateCache(c => ({ ...c, payments: data }));
      } else {
        const data = await fetchStoreMessagesDataAction(store.id);
        updateCache(c => ({ ...c, messages: data }));
      }
    } catch (e) {
      console.error(`Failed to refresh tab ${tab}:`, e);
    }
  }, [store.id, updateCache]);

  // Handle tab click with 0ms transition if cached, or inner shimmer while fetching
  const handleTabSelect = (tab: OrgTabKey) => {
    if (tab === activeTab) return;
    const targetUrl = `/super-admin/stores/${store.id}${TAB_URL_SUFFIX[tab]}`;
    window.history.pushState(null, '', targetUrl);
    setActiveTab(tab);

    if (!tabCache[tab]) {
      loadTab(tab);
    }
  };

  const isLoadingCurrent = loadingTab === activeTab || !tabCache[activeTab];

  const currentMemberCount = tabCache.users?.members
    ? tabCache.users.members.length
    : tabCache.overview?.members
      ? tabCache.overview.members.length
      : memberCount;

  const currentOutletCount = tabCache.outlets?.outlets ? tabCache.outlets.outlets.length : store.outletCount;
  const currentStore = currentOutletCount !== store.outletCount ? { ...store, outletCount: currentOutletCount } : store;

  return (
    <StoreDetailShell
      store={currentStore}
      lifecycleBadge={lifecycleBadge}
      memberCount={currentMemberCount}
      activeTabKey={activeTab}
      onTabSelect={handleTabSelect}
    >
      {isLoadingCurrent ? (
        <div style={{ animation: 'toastsb .15s ease-out' }}>
          {activeTab === 'outlets' || activeTab === 'users' ? (
            <TableSkeleton rows={4} cols={5} />
          ) : activeTab === 'activity' ? (
            <TimelineSkeleton count={4} />
          ) : (
            <TabContentSkeleton />
          )}
        </div>
      ) : (
        <div style={{ animation: 'toastsb .15s ease-out' }}>
          {activeTab === 'overview' && tabCache.overview && (
            <StoreOverviewTab
              store={store}
              members={tabCache.overview.members}
              lifecycle={tabCache.overview.lifecycle}
              activity={tabCache.overview.activity}
            />
          )}
          {activeTab === 'outlets' && tabCache.outlets && (
            <StoreOutletsTab
              storeId={store.id}
              hasActiveAccess={store.hasActiveAccess}
              outlets={tabCache.outlets.outlets}
              onRefresh={() => refreshTab('outlets')}
            />
          )}
          {activeTab === 'users' && tabCache.users && (
            <StoreUsersTab members={tabCache.users.members} />
          )}
          {activeTab === 'subscription' && tabCache.subscription && (
            <StoreSubscriptionTab
              store={store}
              invoices={tabCache.subscription.invoices}
              plans={tabCache.subscription.plans}
              hasSubscription={tabCache.subscription.hasSubscription}
              trialEndsAt={tabCache.subscription.trialEndsAt}
            />
          )}
          {activeTab === 'payments' && tabCache.payments && (
            <StorePaymentsTab
              storeId={store.id}
              methods={tabCache.payments.methods}
              locked={store.status === 'LOCKED'}
              onSaved={() => refreshQuiet('payments')}
            />
          )}
          {activeTab === 'messages' && tabCache.messages && (
            <StoreMessagesTab
              storeId={store.id}
              templates={tabCache.messages.templates}
              onSaved={() => refreshQuiet('messages')}
            />
          )}
          {activeTab === 'activity' && tabCache.activity && (
            <StoreActivityTab entries={tabCache.activity.entries} />
          )}
        </div>
      )}
    </StoreDetailShell>
  );
}
