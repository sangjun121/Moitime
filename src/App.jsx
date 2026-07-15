import React, { useState, useMemo, useEffect } from 'react';
import { Copy, CheckCircle2, AlertCircle, MessageSquare, Info, MousePointer2, Calendar, Link as LinkIcon, ArrowRight, Wand2, ChevronLeft, ChevronRight, Clock, Users, Slack } from 'lucide-react';

const buildBoardHours = (start, end) => {
  const hours = [];
  for (let i = start; i <= end; i++) {
    const formatted = i.toString().padStart(2, '0');
    hours.push(`${formatted}:00`);
    if (i !== end) hours.push(`${formatted}:30`);
  }
  return hours;
};

const createDemoAvailability = (dates, start, end) => {
  const demoParticipants = ['지현', '현우', '수빈', '민재'];
  const hours = buildBoardHours(start, end);
  const availability = {};

  dates.forEach((date, dateIndex) => {
    hours.forEach((hour, hourIndex) => {
      const availableUsers = demoParticipants.filter((_, participantIndex) => {
        const pattern = (dateIndex * 3 + hourIndex * 2 + participantIndex) % 5;
        return pattern !== 0 && pattern !== 3;
      });

      if (availableUsers.length > 0) {
        availability[`${date}-${hour}`] = availableUsers;
      }
    });
  });

  return { demoParticipants, availability };
};

const SLACK_NOTIFICATION = 'Slack';
const CREATOR_NOTIFICATION_CHANNELS = [SLACK_NOTIFICATION];
const NO_CREATOR_NOTIFICATION = '받지 않음';
const MEETING_TYPES = {
  FRIENDS: 'friends',
  WORK: 'work',
};

export default function App() {
  // --- 라우팅 상태 (메인 페이지 vs 보드 페이지) ---
  const [appState, setAppState] = useState('home');
  const [boardParams, setBoardParams] = useState(null);

  // --- 메인 페이지(생성) 폼 상태 ---
  const [meetingType, setMeetingType] = useState(MEETING_TYPES.FRIENDS);
  const [meetingTitle, setMeetingTitle] = useState('');
  const [selectedDates, setSelectedDates] = useState([]);
  const [calendarStartDate, setCalendarStartDate] = useState(() => {
    const today = new Date();
    const start = new Date(today);
    start.setHours(0, 0, 0, 0);
    start.setDate(today.getDate() - today.getDay());
    return start;
  });
  const [startHour, setStartHour] = useState('09');
  const [endHour, setEndHour] = useState('18');
  const [isCreatorNotificationEnabled, setIsCreatorNotificationEnabled] = useState(false);
  const [expectedParticipantCount, setExpectedParticipantCount] = useState('');
  const [creatorNotificationPreference, setCreatorNotificationPreference] = useState(NO_CREATOR_NOTIFICATION);

  // --- 보드(투표) 페이지 상태 ---
  const [currentUser, setCurrentUser] = useState('');
  const [isJoined, setIsJoined] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [availability, setAvailability] = useState({});
  const [selectedResultIndex, setSelectedResultIndex] = useState(0);
  const [shareMessage, setShareMessage] = useState('');
  const [waveSlots, setWaveSlots] = useState({});
  const [isSlackConnectModalOpen, setIsSlackConnectModalOpen] = useState(false);
  const [slackConnectTarget, setSlackConnectTarget] = useState('home');
  
  // 드래그 및 UI 상태
  const [isDragging, setIsDragging] = useState(false);
  const [dragMode, setDragMode] = useState(null); 
  const [tooltipData, setTooltipData] = useState({ visible: false, x: 0, y: 0, slotKey: null });
  const [toastMessage, setToastMessage] = useState(null);
  
  // 구글 캘린더 연동 상태
  const [isGoogleCalendarModalOpen, setIsGoogleCalendarModalOpen] = useState(false);
  const [isCalendarAutoFilling, setIsCalendarAutoFilling] = useState(false);

  // --- URL Hash 기반 라우팅 ---
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      window.scrollTo(0, 0);

      if (hash.startsWith('#board?')) {
        const query = hash.replace('#board?', '');
        const params = new URLSearchParams(query);
        const parsedExpectedParticipants = parseInt(params.get('expected') || '', 10);
        const nextBoardParams = {
          title: params.get('title') || '제목 없음',
          type: params.get('type') === MEETING_TYPES.WORK ? MEETING_TYPES.WORK : MEETING_TYPES.FRIENDS,
          dates: (params.get('dates') || '').split(',').filter(Boolean),
          start: parseInt(params.get('start') || '9', 10),
          end: parseInt(params.get('end') || '18', 10),
          expectedParticipants: Number.isFinite(parsedExpectedParticipants) && parsedExpectedParticipants > 0 ? parsedExpectedParticipants : null,
          notificationChannel: params.get('notify') === SLACK_NOTIFICATION ? SLACK_NOTIFICATION : NO_CREATOR_NOTIFICATION
        };

        setBoardParams(nextBoardParams);
        setAppState('board');
        
        // 보드 이동 시 초기화
        if (params.get('demo') === '1') {
          const demo = createDemoAvailability(nextBoardParams.dates, nextBoardParams.start, nextBoardParams.end);
          setParticipants(demo.demoParticipants);
          setAvailability(demo.availability);
        } else {
          setParticipants([]);
          setAvailability({});
        }
        setIsJoined(false);
        setCurrentUser('');
        setSelectedResultIndex(0);
        setShareMessage('');
        setWaveSlots({});
      } else {
        setAppState('home');
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    handleHashChange(); // 초기 로드
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // --- 공통 유틸 ---
  const formatDateKey = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const formatMonthLabel = (date, previousDate) => {
    const monthLabel = date.toLocaleString('en-US', { month: 'short' });
    if (!previousDate) return monthLabel;

    const previousMonthLabel = previousDate.toLocaleString('en-US', { month: 'short' });
    if (previousDate.getMonth() !== date.getMonth()) {
      return `${previousMonthLabel}/${monthLabel}`;
    }

    return monthLabel;
  };

  const isSameDay = (a, b) => formatDateKey(a) === formatDateKey(b);

  const showToast = (message) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const copyToClipboard = (text, successMsg = '복사되었습니다.') => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "absolute";
    textArea.style.left = "-999999px";
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      showToast(successMsg);
    } catch (err) {
      showToast('복사에 실패했습니다.');
    } finally {
      textArea.remove();
    }
  };

  // --- 메인 페이지 핸들러 ---
  const handleToggleCalendarDate = (date) => {
    const dateKey = formatDateKey(date);
    setSelectedDates(prev => (
      prev.includes(dateKey)
        ? prev.filter(selectedDate => selectedDate !== dateKey)
        : [...prev, dateKey].sort()
    ));
  };

  const moveCalendarByWeeks = (weekOffset) => {
    setCalendarStartDate(prev => {
      const next = new Date(prev);
      next.setDate(prev.getDate() + weekOffset * 7);
      return next;
    });
  };

  const resetCalendarToToday = () => {
    const today = new Date();
    const start = new Date(today);
    start.setHours(0, 0, 0, 0);
    start.setDate(today.getDate() - today.getDay());
    setCalendarStartDate(start);
  };

  const calendarWeeks = useMemo(() => {
    return Array.from({ length: 5 }).map((_, weekIndex) => (
      Array.from({ length: 7 }).map((__, dayIndex) => {
        const date = new Date(calendarStartDate);
        date.setDate(calendarStartDate.getDate() + weekIndex * 7 + dayIndex);
        return date;
      })
    ));
  }, [calendarStartDate]);

  const handleCreateMeeting = () => {
    if (selectedDates.length === 0) { alert("날짜를 하루 이상 선택해주세요."); return; }
    if (parseInt(startHour) >= parseInt(endHour)) { alert("시작 시간이 종료 시간보다 빨라야 합니다."); return; }
    if (meetingType === MEETING_TYPES.WORK && isCreatorNotificationEnabled && expectedParticipantCount && parseInt(expectedParticipantCount, 10) < 1) { alert("예상 참여 인원은 1명 이상으로 입력해주세요."); return; }
    const safeMeetingTitle = meetingTitle.trim() || '모임';

    const params = new URLSearchParams({
      title: safeMeetingTitle,
      type: meetingType,
      dates: selectedDates.join(','),
      start: startHour,
      end: endHour
    });

    if (meetingType === MEETING_TYPES.WORK && isCreatorNotificationEnabled && expectedParticipantCount) {
      params.set('expected', expectedParticipantCount);
    }
    params.set('notify', meetingType === MEETING_TYPES.WORK && isCreatorNotificationEnabled ? creatorNotificationPreference : NO_CREATOR_NOTIFICATION);
    
    window.location.hash = `board?${params.toString()}`;
  };

  // --- 보드 페이지 로직 ---
  const boardHours = useMemo(() => {
    if (!boardParams) return [];
    return buildBoardHours(boardParams.start, boardParams.end);
  }, [boardParams]);

  const handleJoinBoard = (e) => {
    e.preventDefault();
    if (!currentUser.trim()) return;
    if (!participants.includes(currentUser.trim())) {
      setParticipants([...participants, currentUser.trim()]);
    }
    setIsJoined(true);
    showToast(boardParams?.type === MEETING_TYPES.FRIENDS ? `${currentUser}님으로 시작했어요.` : `${currentUser}님으로 참여했습니다.`);
  };

  const updateSlot = (slotKey, forceMode) => {
    if (!isJoined) return;
    setWaveSlots(prev => {
      if (!prev[slotKey]) return prev;
      const next = { ...prev };
      delete next[slotKey];
      return next;
    });

    setAvailability(prev => {
      const currentSlotUsers = prev[slotKey] || [];
      const hasUser = currentSlotUsers.includes(currentUser);
      let newSlotUsers = [...currentSlotUsers];

      if (forceMode === 'add' && !hasUser) newSlotUsers.push(currentUser);
      else if (forceMode === 'remove' && hasUser) newSlotUsers = newSlotUsers.filter(u => u !== currentUser);

      return { ...prev, [slotKey]: newSlotUsers };
    });

  };

  const handleMouseDown = (slotKey) => {
    if (!isJoined) {
      alert(boardParams?.type === MEETING_TYPES.FRIENDS ? "먼저 닉네임을 입력하고 시작해주세요." : "먼저 이름을 입력하고 참여해주세요.");
      return;
    }
    const hasUser = (availability[slotKey] || []).includes(currentUser);
    const newMode = hasUser ? 'remove' : 'add';
    setIsDragging(true);
    setDragMode(newMode);
    updateSlot(slotKey, newMode);
  };

  const handleMouseEnter = (slotKey) => {
    if (isDragging && dragMode) updateSlot(slotKey, dragMode);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setDragMode(null);
  };

  useEffect(() => {
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, []);

  const applyCalendarAvailability = (isSlotAvailable) => {
    const nextWaveSlots = {};
    let filledCount = 0;

    setAvailability(prev => {
      const nextAvailability = { ...prev };

      boardParams.dates.forEach((date, dateIndex) => {
      boardHours.forEach((hour, hourIndex) => {
        if (isSlotAvailable(date, hour)) {
          const slotKey = `${date}-${hour}`;
          const currentUsers = nextAvailability[slotKey] || [];

          if (!currentUsers.includes(currentUser)) {
            nextAvailability[slotKey] = [...currentUsers, currentUser];
            nextWaveSlots[slotKey] = hourIndex + dateIndex * 2;
            filledCount += 1;
          }
        }
      });
    });

      return nextAvailability;
    });

    setWaveSlots(nextWaveSlots);
    window.setTimeout(() => setWaveSlots({}), 1200);

    return filledCount;
  };

  const applyRandomCalendarAvailability = () => {
    return applyCalendarAvailability(() => Math.random() > 0.42);
  };

  // --- 구글 캘린더 연동 프로토타입 ---
  const handleSyncGoogleCalendar = () => {
    if (!isJoined) { alert("먼저 이름을 입력하고 참여해주세요."); return; }
    if (isCalendarAutoFilling) return;
    setIsGoogleCalendarModalOpen(true);
  };

  const handleConfirmGoogleCalendar = async () => {
    if (!boardParams) return;

    setIsGoogleCalendarModalOpen(false);
    setIsCalendarAutoFilling(true);

    try {
      await new Promise(resolve => setTimeout(resolve, 450));
      const filledCount = applyRandomCalendarAvailability();
      showToast(`구글 캘린더 연동 완료. ${filledCount}개 시간이 채워졌습니다.`);
    } catch (error) {
      alert(error.message || '구글 캘린더 연동에 실패했습니다.');
    } finally {
      setIsCalendarAutoFilling(false);
    }
  };

  const getHeatmapColor = (count, max) => {
    if (count === 0) return 'bg-white hover:bg-gray-50';
    const ratio = count / max;
    if (ratio <= 0.25) return 'bg-[#e8f2ff] hover:bg-[#d6eaff] text-[#0066cc]';
    if (ratio <= 0.5) return 'bg-[#80bfff] hover:bg-[#66b0ff] text-white';
    if (ratio <= 0.75) return 'bg-[#0071e3] hover:bg-[#0071e3] text-white';
    return 'bg-[#004f9f] hover:bg-[#0066cc] text-white font-bold';
  };

  const results = useMemo(() => {
    if (!boardParams) return [];
    const slotStats = [];
    boardParams.dates.forEach(date => {
      boardHours.forEach(hour => {
        const key = `${date}-${hour}`;
        const available = availability[key] || [];
        const unavailable = participants.filter(p => !available.includes(p));
        
        if (available.length > 0) {
          // 간략한 날짜 포맷 (예: 2026-07-15 -> 7/15)
          const shortDate = date.split('-').slice(1).map(d => parseInt(d, 10)).join('/');
          slotStats.push({
            date, hour, time: `${shortDate} ${hour}`,
            availableCount: available.length,
            available, unavailable
          });
        }
      });
    });
    return slotStats.sort((a, b) => b.availableCount - a.availableCount).slice(0, 3);
  }, [availability, participants, boardParams, boardHours]);

  // 선택된 결과에 따른 메시지 템플릿
  const generatedMessage = useMemo(() => {
    if (results.length === 0) return boardParams?.type === MEETING_TYPES.FRIENDS ? "아직 가능한 시간이 없어요." : "입력된 시간이 없습니다.";
    const selected = results[selectedResultIndex] || results[0];

    if (boardParams?.type === MEETING_TYPES.FRIENDS) {
      return `[모임 시간 공유]
${boardParams?.title || '모임'} 시간은 여기 어때요?

후보 시간: ${selected.time}
되는 사람: ${selected.available.join(', ')}

괜찮으면 이 시간으로 정해요.`;
    }
    
    return `[약속 시간 공유]
제목: ${boardParams?.title}

추천 시간: ${selected.time}
가능 인원: ${selected.availableCount}명

- 가능: ${selected.available.join(', ')}
- 불가능: ${selected.unavailable.length > 0 ? selected.unavailable.join(', ') : '없음'}`;
  }, [results, selectedResultIndex, boardParams]);

  const handleOpenSlackConnectModal = (target) => {
    setSlackConnectTarget(target);
    setIsSlackConnectModalOpen(true);
  };

  const handleRequestHomeSlackConnect = () => {
    if (!expectedParticipantCount) {
      alert('예상 참여 인원 수를 먼저 입력해주세요.');
      return;
    }

    const agreed = window.confirm(`입력하신 예상 참여인원 ${expectedParticipantCount}명 만큼 응답을 받은 경우, 설정하신 Slack 채널에 알림이 전송됩니다. 동의하십니까?`);
    if (!agreed) return;

    handleOpenSlackConnectModal('home');
  };

  const handleConfirmSlackConnect = () => {
    setIsSlackConnectModalOpen(false);

    if (slackConnectTarget === 'home') {
      setIsCreatorNotificationEnabled(true);
      setCreatorNotificationPreference(SLACK_NOTIFICATION);
    }

    showToast('Slack 연동이 완료된 것으로 처리했습니다.');
  };

  const boardExpectedParticipantCount = boardParams?.expectedParticipants || null;
  const isWorkMeeting = boardParams?.type === MEETING_TYPES.WORK;

  useEffect(() => {
    setShareMessage(generatedMessage);
  }, [generatedMessage]);

  return (
    <div className="app-shell min-h-screen bg-[#f5f5f7] text-[#1d1d1f] pb-20 select-none">
      {/* Toast */}
      {toastMessage && (
        <div className="fixed top-5 left-1/2 transform -translate-x-1/2 bg-white text-[#1d1d1f] px-4 py-2 rounded-full border border-[#e0e0e0] z-50 flex items-center gap-2">
          <CheckCircle2 size={18} className="text-[#0066cc]" />
          <span className="text-sm font-medium">{toastMessage}</span>
        </div>
      )}

      {isGoogleCalendarModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#f5f5f7]/80 backdrop-blur-sm flex items-center justify-center px-4">
          <div className="bg-white w-full max-w-sm rounded-[18px] border border-[#e0e0e0] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#f0f0f0] flex items-center gap-2">
              <Calendar className="text-[#0066cc]" size={20} />
              <h2 className="font-bold text-[#1d1d1f]">Google Calendar</h2>
            </div>
            <div className="px-5 py-6">
              <p className="text-sm text-[#333333] leading-relaxed">
                현재는 프로토타입이라 실제 계정 권한을 요청하지 않고, 연동에 성공했다고 가정한 뒤 가능한 시간을 자동으로 채웁니다.
              </p>
              <div className="mt-4 rounded-[18px] border border-[#e0e0e0] bg-[#f5f5f7] px-4 py-3 text-sm text-[#333333]">
                {currentUser}님의 캘린더를 기준으로 임의의 가능한 시간이 물결처럼 채워집니다.
              </div>
            </div>
            <div className="px-5 py-4 bg-[#f5f5f7] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsGoogleCalendarModalOpen(false)}
                disabled={isCalendarAutoFilling}
                className="px-4 py-2 rounded-full text-sm font-medium text-[#333333] hover:bg-[#f0f0f0] transition-colors"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleConfirmGoogleCalendar}
                disabled={isCalendarAutoFilling}
                className="px-4 py-2 rounded-full text-sm font-semibold bg-[#0066cc] hover:bg-[#0071e3] text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                연동하고 채우기
              </button>
            </div>
          </div>
        </div>
      )}

      {isSlackConnectModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#f5f5f7]/80 backdrop-blur-sm flex items-center justify-center px-4">
          <div className="bg-white w-full max-w-sm rounded-[18px] border border-[#e0e0e0] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#f0f0f0] flex items-center gap-2">
              <Slack className="text-[#0066cc]" size={20} />
              <h2 className="font-bold text-[#1d1d1f]">Slack 연결</h2>
            </div>
            <div className="px-5 py-6">
              <p className="text-sm text-[#333333] leading-relaxed">
                현재는 프로토타입이라 실제 Slack 권한을 요청하지 않고, 확인을 누르면 연동에 성공했다고 가정합니다.
              </p>
              <div className="mt-4 rounded-[18px] border border-[#e0e0e0] bg-[#f5f5f7] px-4 py-3 text-sm text-[#333333]">
                전원이 응답했을 때 생성자가 Slack으로 알림을 받는 흐름을 검증합니다.
              </div>
            </div>
            <div className="px-5 py-4 bg-[#f5f5f7] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsSlackConnectModalOpen(false)}
                className="px-4 py-2 rounded-full text-sm font-medium text-[#333333] hover:bg-[#f0f0f0] transition-colors"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleConfirmSlackConnect}
                className="px-4 py-2 rounded-full text-sm font-semibold bg-[#0066cc] hover:bg-[#0071e3] text-white transition-colors"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-[#f5f5f7]/92 backdrop-blur-xl text-[#1d1d1f] h-16 px-5 sticky top-0 z-50 border-b border-[#e0e0e0] animate-fade-in">
        <div className="max-w-6xl mx-auto h-full flex items-center justify-between">
          <button
            type="button"
            className="flex items-center gap-2 text-sm font-semibold text-[#1d1d1f] hover:text-[#0071e3] transition-colors"
            onClick={() => {window.location.hash = '';}}
          >
            <span className="w-9 h-9 rounded-full bg-[#0066cc] text-white flex items-center justify-center">
              <Calendar size={17} />
            </span>
            <span className="text-xl font-bold">when7meet</span>
          </button>
        </div>
      </header>

      <div className="bg-[#f5f5f7]/85 backdrop-blur-xl border-b border-[#e0e0e0] sticky top-16 z-40">
        <div className="max-w-6xl mx-auto h-14 px-4 flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#1d1d1f] truncate">
              {appState === 'board' && boardParams ? boardParams.title : '약속 시간 맞추기'}
            </p>
            <p className="text-xs text-[#7a7a7a]">
              {appState === 'board' && boardParams
                ? `${boardParams.dates.length}일 · ${boardParams.start}:00-${boardParams.end}:00`
                : meetingType === MEETING_TYPES.FRIENDS ? '친구들과 되는 시간을 가볍게 맞춰요' : '가능한 날짜와 시간을 빠르게 정리합니다'}
            </p>
          </div>
          {appState === 'board' && (
            <button
              onClick={() => copyToClipboard(
                window.location.href,
                boardParams?.type === MEETING_TYPES.FRIENDS ? '모임 링크가 복사됐어요.' : '초대 링크가 복사되었습니다.'
              )}
              className="text-xs sm:text-sm bg-[#0066cc] hover:bg-[#0071e3] text-white px-4 py-2 rounded-full flex items-center gap-1.5 font-semibold transition-colors"
            >
              <LinkIcon size={14}/> {boardParams?.type === MEETING_TYPES.FRIENDS ? '링크 공유' : '초대'}
            </button>
          )}
        </div>
      </div>

      <main>
        
        {/* =========================================
            메인 페이지 (Home / Create Event) 
            ========================================= */}
        {appState === 'home' && (
          <div className="animate-in fade-in">
            <section className="relative px-4 pt-12 pb-12 sm:pt-20 sm:pb-16 text-center overflow-hidden">
              <p className="text-sm font-semibold text-[#0066cc] mb-4 animate-fade-up">when7meet</p>
              <h2 className="mx-auto max-w-4xl text-[clamp(48px,8vw,104px)] font-semibold leading-[0.95] text-[#1d1d1f]">
                {meetingType === MEETING_TYPES.FRIENDS ? (
                  <>
                    <span className="inline-block animate-word-pop delay-100">우리</span>{' '}
                    <span className="inline-block animate-word-pop delay-300">언제</span><br />
                    <span className="inline-block animate-word-pop delay-500">만날까?</span>
                  </>
                ) : (
                  <>
                    <span className="inline-block animate-word-pop delay-100">모두의</span>{' '}
                    <span className="inline-block animate-word-pop delay-300">시간을</span><br />
                    <span className="inline-block animate-word-pop delay-500">가볍게</span>{' '}
                    <span className="inline-block animate-word-pop delay-700">맞춰요</span>
                  </>
                )}
              </h2>
              <p className="mx-auto mt-6 max-w-2xl text-base sm:text-xl leading-relaxed text-[#333333] animate-fade-up delay-900">
                {meetingType === MEETING_TYPES.FRIENDS
                  ? '날짜 몇 개만 고르고 링크를 보내세요. 친구들이 되는 시간만 칠하면 바로 보기 좋게 정리됩니다.'
                  : '후보 날짜를 고르고, 각자 가능한 시간을 칠한 뒤 응답 현황까지 한 흐름에서 확인합니다.'}
              </p>
            </section>

            <section className="max-w-3xl mx-auto px-4 animate-slide-up delay-300">
            {/* 약속 만들기 */}
            <div className="w-full bg-white p-5 sm:p-8 rounded-[18px] border border-[#e0e0e0]">
              <div className="mb-7">
                <p className="text-sm font-semibold text-[#1d1d1f] mb-2">{meetingType === MEETING_TYPES.FRIENDS ? '새 모임' : '새 일정'}</p>
                <h2 className="text-2xl sm:text-3xl font-semibold mb-2 text-[#1d1d1f]">
                  {meetingType === MEETING_TYPES.FRIENDS ? '친구들이랑 만날 날짜를 골라요' : '가능한 날짜를 먼저 고르세요'}
                </h2>
                <p className="text-sm text-[#7a7a7a]">
                  {meetingType === MEETING_TYPES.FRIENDS ? '후보 날짜와 시간대를 정하면 바로 공유할 수 있는 모임 보드가 만들어집니다.' : '후보 날짜와 시간대를 정하면 바로 투표 보드가 만들어집니다.'}
                </p>
              </div>
              
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-semibold text-[#333333] mb-2">어떤 약속인가요?</label>
                  <div className="grid grid-cols-2 gap-2 rounded-[18px] bg-[#f5f5f7] p-2 border border-[#e0e0e0]">
                    {[
                      { type: MEETING_TYPES.FRIENDS, title: '친구 모임', description: '가볍게 공유하고 정하기' },
                      { type: MEETING_TYPES.WORK, title: '업무 일정', description: '응답 완료 Slack 알림 사용' },
                    ].map(option => {
                      const isSelected = meetingType === option.type;
                      return (
                        <button
                          key={option.type}
                          type="button"
                          onClick={() => {
                            setMeetingType(option.type);
                            if (option.type === MEETING_TYPES.FRIENDS) {
                              setIsCreatorNotificationEnabled(false);
                              setExpectedParticipantCount('');
                              setCreatorNotificationPreference(NO_CREATOR_NOTIFICATION);
                            }
                          }}
                          className={`rounded-[14px] px-4 py-4 text-left transition-colors ${
                            isSelected ? 'bg-white text-[#1d1d1f] border border-[#0066cc]' : 'text-[#7a7a7a] hover:bg-white/70 border border-transparent'
                          }`}
                        >
                          <span className="block text-sm font-semibold">{option.title}</span>
                          <span className="mt-1 block text-xs">{option.description}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-[#333333] mb-2">{meetingType === MEETING_TYPES.FRIENDS ? '모임 이름' : '일정 이름'}</label>
                  <input 
                    type="text" 
                    value={meetingTitle}
                    onChange={(e) => setMeetingTitle(e.target.value)}
                    className="w-full border-0 bg-[#f5f5f7] rounded-[12px] px-4 py-3 focus:ring-2 focus:ring-[#0071e3] outline-none text-[#1d1d1f] placeholder:text-[#7a7a7a]"
                    placeholder={meetingType === MEETING_TYPES.FRIENDS ? '예: 성수에서 저녁' : '미입력 시 모임'}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-semibold text-[#333333]">후보 날짜</label>
                    <span className="text-xs font-semibold text-[#0071e3]">{selectedDates.length}일 선택</span>
                  </div>
                  <div className="rounded-[18px] border border-[#e0e0e0] bg-[#f5f5f7] p-4">
                    <div className="flex items-center justify-between mb-4">
                      <button
                        type="button"
                        onClick={() => moveCalendarByWeeks(-1)}
                        className="w-9 h-9 rounded-full bg-white hover:bg-[#f0f0f0] border border-[#e0e0e0] text-[#333333] flex items-center justify-center transition-colors"
                        aria-label="이전 주"
                      >
                        <ChevronLeft size={18} />
                      </button>
                      <div className="text-center">
	                        <div className="text-lg font-semibold text-[#1d1d1f]">
                          {calendarStartDate.toLocaleString('ko-KR', { year: 'numeric', month: 'long' })}
                        </div>
                        <div className="text-xs text-[#7a7a7a] mt-0.5">한 번 누르면 선택, 다시 누르면 해제</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => moveCalendarByWeeks(1)}
                        className="w-9 h-9 rounded-full bg-white hover:bg-[#f0f0f0] border border-[#e0e0e0] text-[#333333] flex items-center justify-center transition-colors"
                        aria-label="다음 주"
                      >
                        <ChevronRight size={18} />
                      </button>
                    </div>

                    <div className="grid grid-cols-[52px_repeat(7,minmax(0,1fr))_52px] gap-1 items-center text-center">
                      <div />
                      {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((dayLabel, index) => (
	                        <div key={`${dayLabel}-${index}`} className="text-sm font-semibold text-[#333333] py-1">
                          {dayLabel}
                        </div>
                      ))}
                      <div />

                      {calendarWeeks.map((week, weekIndex) => {
                        const firstDate = week[0];
                        const previousDate = weekIndex > 0 ? calendarWeeks[weekIndex - 1][6] : null;
                        const today = new Date();

                        return (
                          <React.Fragment key={formatDateKey(firstDate)}>
	                            <div className="text-right pr-2 text-sm font-semibold text-[#1d1d1f]">
                              {formatMonthLabel(firstDate, previousDate)}
                            </div>
                            {week.map(date => {
                              const dateKey = formatDateKey(date);
                              const isSelected = selectedDates.includes(dateKey);
                              const isToday = isSameDay(date, today);

                              return (
                                <button
                                  key={dateKey}
                                  type="button"
                                  onClick={() => handleToggleCalendarDate(date)}
                                  className={`h-10 rounded-[10px] border text-base font-semibold tabular-nums transition-colors
                                    ${isSelected
                                      ? 'bg-[#0066cc] border-[#0066cc] text-white'
                                      : isToday
                                        ? 'bg-white border-[#0066cc] text-[#0071e3] hover:bg-[#f5f5f7]'
                                        : 'bg-white border-[#e0e0e0] text-[#1d1d1f] hover:bg-[#f5f5f7] hover:border-[#0066cc]'
                                    }`}
                                >
                                  {date.getDate()}
                                </button>
                              );
                            })}
	                            <div className="text-left pl-2 text-sm font-semibold text-[#1d1d1f]">
                              {firstDate.getFullYear()}
                            </div>
                          </React.Fragment>
                        );
                      })}
                    </div>

                    <div className="flex justify-center mt-4">
                      <button
                        type="button"
                        onClick={resetCalendarToToday}
                        className="px-4 py-2 rounded-full bg-white hover:bg-[#f0f0f0] border border-[#e0e0e0] text-sm font-semibold text-[#333333] transition-colors"
                      >
                        오늘
                      </button>
                    </div>
                  </div>
                </div>

                <div>
	                  <div className="flex items-center justify-between mb-2">
	                    <label className="block text-sm font-semibold text-[#333333]">투표할 시간대</label>
	                    <button
	                      type="button"
	                      onClick={() => {
	                        setStartHour('00');
	                        setEndHour('23');
	                      }}
	                      className="rounded-full bg-[#e8f2ff] px-3 py-1 text-xs font-semibold text-[#0066cc] hover:bg-[#d6eaff] transition-colors"
	                    >
	                      전체 시간
	                    </button>
	                  </div>
                  <div className="flex items-center gap-3">
	                    <select value={startHour} onChange={(e) => setStartHour(e.target.value)} className="border-0 bg-[#f5f5f7] rounded-[12px] px-3 py-3 flex-1 focus:ring-2 focus:ring-[#0071e3] outline-none">
                      {Array.from({length: 24}).map((_, i) => (
                        <option key={i} value={i.toString().padStart(2, '0')}>{i.toString().padStart(2, '0')}:00</option>
                      ))}
                    </select>
                    <span className="text-[#7a7a7a] font-bold">~</span>
	                    <select value={endHour} onChange={(e) => setEndHour(e.target.value)} className="border-0 bg-[#f5f5f7] rounded-[12px] px-3 py-3 flex-1 focus:ring-2 focus:ring-[#0071e3] outline-none">
                       {Array.from({length: 24}).map((_, i) => (
                        <option key={i} value={i.toString().padStart(2, '0')}>{i.toString().padStart(2, '0')}:00</option>
                      ))}
                    </select>
                  </div>
                  <p className="mt-2 text-xs text-[#7a7a7a]">
                    종료 시간이 23시이면 마지막 슬롯은 23:00부터 24:00까지 포함됩니다.
                  </p>
                </div>

                {meetingType === MEETING_TYPES.WORK && (
                <div className="rounded-[18px] border border-[#e0e0e0] bg-[#f5f5f7] p-4">
                  <div className="mb-4 flex items-start justify-between gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-[#333333] mb-2">응답 완료 알림</label>
                      <p className="text-xs leading-relaxed text-[#7a7a7a]">
                        사용할 때만 켜세요. 켜면 예상 참여 인원 기준으로 Slack 알림을 받을 수 있습니다.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setIsCreatorNotificationEnabled(prev => {
                          const next = !prev;
                          if (!next) {
                            setExpectedParticipantCount('');
                            setCreatorNotificationPreference(NO_CREATOR_NOTIFICATION);
                          }
                          return next;
                        });
                      }}
                      className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition-colors ${
                        isCreatorNotificationEnabled
                          ? 'bg-[#0066cc] text-white'
                          : 'bg-white text-[#7a7a7a] border border-[#e0e0e0]'
                      }`}
                    >
                      {isCreatorNotificationEnabled ? '사용 중' : '사용 안 함'}
                    </button>
                  </div>
                  <div className={`grid grid-cols-1 sm:grid-cols-[1fr_1.5fr] gap-3 ${isCreatorNotificationEnabled ? '' : 'opacity-45'}`}>
                    <div>
                      <label className="block text-xs font-semibold text-[#7a7a7a] mb-1">예상 참여 인원</label>
                      <input
                        type="number"
                        min="1"
                        inputMode="numeric"
                        disabled={!isCreatorNotificationEnabled}
                        value={expectedParticipantCount}
                        onChange={(e) => setExpectedParticipantCount(e.target.value.replace(/[^0-9]/g, ''))}
                        className="w-full border-0 bg-white rounded-[12px] px-4 py-3 focus:ring-2 focus:ring-[#0071e3] outline-none text-[#1d1d1f] placeholder:text-[#7a7a7a] disabled:cursor-not-allowed"
                        placeholder="예: 5"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#7a7a7a] mb-1">생성자 알림 채널</label>
                      <div className="grid grid-cols-1 gap-2">
                        {CREATOR_NOTIFICATION_CHANNELS.map(channel => (
                          <button
                            key={channel}
                            type="button"
                            disabled={!isCreatorNotificationEnabled}
                            onClick={handleRequestHomeSlackConnect}
                            className={`rounded-full px-3 py-3 text-xs font-semibold border transition-colors ${
                              creatorNotificationPreference === channel
                                ? 'bg-[#0066cc] border-[#0066cc] text-white'
                                : 'bg-white border-[#e0e0e0] text-[#333333] hover:border-[#0066cc] disabled:hover:border-[#e0e0e0] disabled:cursor-not-allowed'
                            }`}
                          >
                            Slack 연결하기
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                )}

                <button 
                  onClick={handleCreateMeeting}
	                  className="w-full mt-4 bg-[#0066cc] hover:bg-[#0071e3] text-white font-semibold text-base py-4 rounded-full flex items-center justify-center gap-2 transition-colors"
                >
                  {meetingType === MEETING_TYPES.FRIENDS ? '모임 보드 만들기' : '보드 생성하기'} <ArrowRight size={20} />
                </button>
              </div>
            </div>

	          </section>
          </div>
        )}

        {/* =========================================
            보드 페이지 (Board / Vote) 
            ========================================= */}
        {appState === 'board' && boardParams && (
          <div className="animate-in fade-in">
            {/* Tooltip for Heatmap */}
            {tooltipData.visible && tooltipData.slotKey && (
              <div 
                className="fixed z-50 bg-white border border-[#e0e0e0] rounded-[18px] p-3 w-48 pointer-events-none transform -translate-x-1/2 -translate-y-full mt-[-10px]"
                style={{ left: tooltipData.x, top: tooltipData.y }}
              >
                <div className="text-sm font-bold border-b border-[#f0f0f0] pb-2 mb-2 text-center text-[#1d1d1f]">
                  {tooltipData.slotKey}
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-[#0071e3] flex justify-between">
                    <span>가능</span>
                    <span>{(availability[tooltipData.slotKey] || []).length}명</span>
                  </div>
                  <div className="text-xs text-[#333333] break-words leading-tight">
                    {(availability[tooltipData.slotKey] || []).join(', ') || '-'}
                  </div>
                </div>
                <div className="space-y-1 mt-3">
                  <div className="text-xs font-semibold text-[#7a7a7a] flex justify-between">
                    <span>{isWorkMeeting ? '불가능' : '아직 안 고름'}</span>
                    <span>
                      {participants.filter(p => !(availability[tooltipData.slotKey] || []).includes(p)).length}명
                    </span>
                  </div>
                  <div className="text-xs text-[#333333] break-words leading-tight">
                    {participants.filter(p => !(availability[tooltipData.slotKey] || []).includes(p)).join(', ') || '-'}
                  </div>
                </div>
              </div>
            )}

            {/* 타이틀 영역 & 로그인 폼 */}
            <div className="max-w-6xl mx-auto px-4 py-8">
            <section className="bg-white text-[#1d1d1f] p-6 sm:p-10 rounded-[18px] border border-[#e0e0e0] mb-6">
              <div className="flex flex-col lg:flex-row lg:items-end gap-6 justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-semibold text-[#0066cc] mb-3">
                    <Calendar size={16} />
                    {isWorkMeeting ? '약속 보드' : '모임 보드'}
                  </div>
                  <h2 className="text-3xl sm:text-5xl font-semibold leading-[0.95] text-[#1d1d1f] truncate">{boardParams.title}</h2>
                  <div className="flex flex-wrap gap-2 mt-5">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f5f5f7] px-3 py-1.5 text-xs font-semibold text-[#333333]">
                      <Calendar size={13} /> {boardParams.dates.length}일
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f5f5f7] px-3 py-1.5 text-xs font-semibold text-[#333333]">
                      <Clock size={13} /> {boardParams.start}:00-{boardParams.end}:00
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f5f5f7] px-3 py-1.5 text-xs font-semibold text-[#333333]">
                      <Users size={13} /> {participants.length}명 {isWorkMeeting ? '참여' : '함께'}
                    </span>
                    {isWorkMeeting && boardExpectedParticipantCount && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e8f2ff] px-3 py-1.5 text-xs font-semibold text-[#0066cc]">
                        예상 {boardExpectedParticipantCount}명
                      </span>
                    )}
                  </div>
                </div>

                <form onSubmit={handleJoinBoard} className="w-full lg:w-auto">
                  <div className="rounded-full bg-[#f5f5f7] p-2 flex gap-2 border border-[#e0e0e0]">
                    <input
                      type="text"
                      value={currentUser}
                      onChange={(e) => setCurrentUser(e.target.value)}
                      disabled={isJoined}
                      placeholder={isWorkMeeting ? '이름 입력' : '닉네임'}
                      className="min-w-0 flex-1 lg:w-40 border-0 bg-transparent px-3 py-2 text-sm text-[#1d1d1f] placeholder:text-[#7a7a7a] focus:ring-0 outline-none disabled:text-[#7a7a7a]"
                    />
                    {!isJoined ? (
                      <button type="submit" className="bg-[#0066cc] hover:bg-[#0071e3] text-white px-4 py-2 rounded-full text-sm font-semibold transition-colors">
                        {isWorkMeeting ? '참여' : '시작'}
                      </button>
                    ) : (
                      <button type="button" onClick={() => { setIsJoined(false); setCurrentUser(''); }} className="bg-white hover:bg-[#f0f0f0] text-[#1d1d1f] px-4 py-2 rounded-full text-sm font-semibold transition-colors">
                        변경
                      </button>
                    )}
                  </div>
                </form>
              </div>
            </section>

            {/* 메인 투표 그리드 영역 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
              {/* 내 가능 시간 칠하기 */}
              <section className="bg-white p-5 sm:p-6 rounded-[18px] border border-[#e0e0e0] relative">
                {!isJoined && (
                  <div className="absolute inset-0 bg-white/80 backdrop-blur-[1px] z-20 flex flex-col items-center justify-center rounded-[18px]">
                    <AlertCircle className="text-[#7a7a7a] mb-2" size={32} />
                    <p className="text-[#333333] font-semibold">
                      {isWorkMeeting ? '위쪽에 이름을 입력하고 참여해주세요' : '위쪽에 닉네임을 입력하고 시작해주세요'}
                    </p>
                  </div>
                )}
                
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
                  <div className="flex-1">
                    <h3 className="font-semibold text-[#1d1d1f]">{isWorkMeeting ? '내 가능 시간' : '내가 되는 시간'}</h3>
                    <p className="text-xs text-[#7a7a7a] mt-1">
                      {isWorkMeeting ? '가능한 칸을 눌러 초록색으로 표시하세요.' : '되는 시간만 톡톡 눌러 표시하세요.'}
                    </p>
                  </div>
                  
                  {isWorkMeeting && (
                  <button 
                    onClick={handleSyncGoogleCalendar}
                    disabled={!isJoined || isCalendarAutoFilling}
                    className="flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-full bg-[#e8f2ff] text-[#1d1d1f] hover:bg-[#d6eaff] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Wand2 size={14}/>
                    {isCalendarAutoFilling ? '캘린더 확인 중...' : '구글 캘린더 연결'}
                  </button>
                  )}
                </div>
                <div className="flex items-center justify-between gap-3 mb-3 text-xs text-[#7a7a7a]">
                  <span className="inline-flex items-center gap-1"><MousePointer2 size={12}/> 클릭 또는 드래그</span>
                  <span className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-[#0066cc]" /> {isWorkMeeting ? '가능' : '됨'}</span>
                  <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-white border border-[#e0e0e0]" /> {isWorkMeeting ? '불가능' : '아직'}</span>
                  </span>
                </div>

                <div className="overflow-x-auto select-none pb-2 relative">
                  <table className="w-full text-center text-sm border-collapse">
                    <thead>
                      <tr>
                        <th className="p-2 border-b border-r border-[#e0e0e0] w-16 bg-[#f5f5f7]"></th>
                        {boardParams.dates.map(date => (
                          <th key={date} className="p-2 border-b border-[#e0e0e0] font-semibold bg-[#f5f5f7] min-w-[70px] text-[#333333]">
                            {date.split('-').slice(1).join('/')}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody onMouseLeave={handleMouseUp}>
                      {boardHours.map(hour => (
                        <tr key={hour}>
                          <td className="p-1 border-r border-b border-[#e0e0e0] text-xs text-[#7a7a7a] bg-[#f5f5f7] align-top h-7 tabular-nums">
                            {hour}
                          </td>
                          {boardParams.dates.map(date => {
                            const slotKey = `${date}-${hour}`;
                            const isAvailable = (availability[slotKey] || []).includes(currentUser);
                            const waveIndex = waveSlots[slotKey];
                            return (
                              <td 
                                key={slotKey}
                                onMouseDown={() => handleMouseDown(slotKey)}
                                onMouseEnter={() => handleMouseEnter(slotKey)}
                                style={waveIndex !== undefined ? { '--wave-delay': `${waveIndex * 18}ms` } : undefined}
                                className={`availability-cell border border-[#e0e0e0] cursor-pointer
                                  ${isAvailable ? 'is-available bg-[#0066cc] border-[#0071e3]' : 'bg-white hover:bg-[#f0f0f0]'}
                                  ${waveIndex !== undefined ? 'wave-fill' : ''}`}
                              ></td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* 그룹 전체 히트맵 */}
              <section className="bg-white p-5 sm:p-6 rounded-[18px] border border-[#e0e0e0]">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-4">
                  <div className="flex-1">
                    <h3 className="font-semibold text-[#1d1d1f]">{isWorkMeeting ? '그룹 전체 시간' : '다 같이 되는 시간'}</h3>
                    <p className="text-xs text-[#7a7a7a] mt-1">
                      {isWorkMeeting ? '진한 파랑일수록 가능한 사람이 많습니다.' : '진하게 표시될수록 같이 만날 가능성이 높아요.'}
                    </p>
                  </div>
                  <span className="text-xs text-[#7a7a7a] flex items-center gap-1">
                    <Info size={12}/> {participants.length}명 {isWorkMeeting ? '참여' : '함께'}
                  </span>
                </div>

                <div className="overflow-x-auto relative pb-2">
                  <table className="w-full text-center text-sm border-collapse">
                    <thead>
                      <tr>
                        <th className="p-2 border-b border-r border-[#e0e0e0] w-16 bg-[#f5f5f7]"></th>
                        {boardParams.dates.map(date => (
                          <th key={date} className="p-2 border-b border-[#e0e0e0] font-semibold bg-[#f5f5f7] min-w-[70px] text-[#333333]">
                            {date.split('-').slice(1).join('/')}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {boardHours.map(hour => (
                        <tr key={hour}>
                          <td className="p-1 border-r border-b border-[#e0e0e0] text-xs text-[#7a7a7a] bg-[#f5f5f7] align-top h-7 tabular-nums">
                            {hour}
                          </td>
                          {boardParams.dates.map(date => {
                            const slotKey = `${date}-${hour}`;
                            const availableCount = (availability[slotKey] || []).length;
                            const cellClass = getHeatmapColor(availableCount, participants.length);
                            const waveIndex = waveSlots[slotKey];
                            
                            return (
                              <td 
                                key={slotKey}
                                onMouseEnter={(e) => {
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  setTooltipData({ visible: true, x: rect.left + rect.width/2, y: rect.top, slotKey });
                                }}
                                onMouseLeave={() => setTooltipData({ ...tooltipData, visible: false })}
                                style={waveIndex !== undefined ? { '--wave-delay': `${waveIndex * 18}ms` } : undefined}
                                className={`availability-cell border border-[#f0f0f0] cursor-help ${cellClass} ${waveIndex !== undefined ? 'wave-fill' : ''}`}
                              >
                                {availableCount > 0 && availableCount === participants.length && participants.length > 0 ? (
                                  <span className="text-[10px]">전원: {availableCount}</span>
                                ) : availableCount > 0 ? (
                                  <span className="text-xs opacity-80">{availableCount}</span>
                                ) : null}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>

            {/* 결과 요약 및 공유 */}
            <section className="bg-white p-5 sm:p-6 rounded-[18px] border border-[#e0e0e0]">
	               <div className="flex items-center gap-2 mb-6">
	                  <h3 className="font-semibold text-[#1d1d1f]">{isWorkMeeting ? '결과 요약' : '언제 만날까요?'}</h3>
                </div>
                
                <div className={`grid grid-cols-1 ${isWorkMeeting ? 'md:grid-cols-2' : 'lg:grid-cols-[0.9fr_1.1fr]'} gap-8`}>
                  {/* Top 결과 카드 */}
                  <div>
	                    <h4 className="text-sm font-semibold text-[#7a7a7a] mb-3">{isWorkMeeting ? '가장 많이 겹친 시간' : '많이 되는 시간'}</h4>
                    {results.length === 0 ? (
	                      <div className="text-sm text-[#7a7a7a] bg-[#f5f5f7] p-5 rounded-[18px] border border-[#f0f0f0] text-center py-8">
                        {isWorkMeeting ? '아직 선택된 가능 시간이 없습니다.' : '아직 친구들이 고른 시간이 없어요.'}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {results.map((res, idx) => {
                          const isSelected = selectedResultIndex === idx;
                          return (
                            <div 
                              key={idx} 
                              onClick={() => setSelectedResultIndex(idx)}
	                              className={`p-4 rounded-[18px] border flex items-center justify-between cursor-pointer transition-all
	                                ${isSelected ? 'border-[#0066cc] bg-[#e8f2ff]' : 'border-[#f0f0f0] bg-white hover:border-[#0066cc] hover:bg-[#f5f5f7]'}`}
                            >
                              <div>
	                                {idx === 0 && <span className="text-xs font-semibold text-[#0071e3] bg-white px-2 py-0.5 rounded-full mb-1 inline-block">추천</span>}
	                                {idx !== 0 && isSelected && <span className="text-xs font-semibold text-[#333333] bg-white px-2 py-0.5 rounded-full mb-1 inline-block">선택됨</span>}
	                                <div className={`font-semibold ${isSelected ? 'text-[#0071e3] text-lg' : 'text-[#1d1d1f]'}`}>{res.time}</div>
                                <div className="text-xs text-[#7a7a7a] mt-1">
                                  {isWorkMeeting ? '가능' : '되는 사람'}: {res.available.join(', ')}
                                  {isWorkMeeting && (
                                    <>
                                      <br/>
                                      <span className="text-[#7a7a7a]">불가능: {res.unavailable.length > 0 ? res.unavailable.join(', ') : '없음'}</span>
                                    </>
                                  )}
                                </div>
                              </div>
	                              <div className={`text-center rounded-[14px] px-3 py-2 ${isSelected ? 'bg-white' : 'bg-[#f5f5f7]'}`}>
                                <div className="text-xs text-[#7a7a7a]">{isWorkMeeting ? '참석' : '가능'}</div>
	                                <div className={`font-semibold ${isSelected ? 'text-[#0071e3]' : 'text-[#333333]'}`}>{res.availableCount}명</div>
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setSelectedResultIndex(idx);
                                      showToast(isWorkMeeting ? '선택한 시간으로 공유 메시지를 만들었습니다.' : '이 시간으로 정했어요. 공유 메시지를 복사해보세요.');
                                    }}
                                    className={`mt-2 rounded-full px-3 py-1 text-[11px] font-semibold transition-colors ${
                                      isSelected ? 'bg-[#0066cc] text-white' : 'bg-white text-[#0066cc] hover:bg-[#e8f2ff]'
                                    }`}
                                  >
                                    이 시간으로 정하기
                                  </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* 공유 텍스트 */}
                  <div className="flex flex-col h-full">
	                    <h4 className="text-sm font-semibold text-[#7a7a7a] mb-3 flex items-center gap-1">
                      <MessageSquare size={14}/> {isWorkMeeting ? '공유 메시지' : '친구들에게 보낼 메시지'}
                    </h4>
                    {!isWorkMeeting && (
                      <p className="mb-3 text-sm text-[#7a7a7a]">
                        선택한 시간을 기준으로 바로 복사해서 카톡이나 DM에 붙여 넣으면 됩니다.
                      </p>
                    )}
                    <textarea 
                      value={shareMessage}
                      onChange={(e) => setShareMessage(e.target.value)}
	                      className="w-full flex-1 border-0 rounded-[18px] p-4 text-sm text-[#333333] bg-[#f5f5f7] focus:outline-none focus:ring-2 focus:ring-[#0071e3] resize-none min-h-[160px] font-mono"
                    />
                    <button 
                      onClick={() => copyToClipboard(
                        shareMessage,
                        isWorkMeeting ? '공유 메시지가 복사되었습니다.' : '친구들에게 보낼 메시지가 복사됐어요.'
                      )}
	                      className="mt-4 w-full bg-[#0066cc] hover:bg-[#0071e3] text-white font-semibold py-3 rounded-full flex items-center justify-center gap-2 transition-colors"
                    >
                      <Copy size={16} />
                      {isWorkMeeting ? '공유 메시지 복사' : '메시지 복사하기'}
                    </button>
                  </div>
                </div>
            </section>

          </div>
          </div>
        )}
      </main>
      
      {/* CSS Animation */}
      <style>{`
        :root {
          font-family: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Pretendard", "Noto Sans KR", "Segoe UI", sans-serif;
          color: #1d1d1f;
          letter-spacing: 0;
          font-synthesis: none;
          text-rendering: optimizeLegibility;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }
        body {
          margin: 0;
          font-family: inherit;
          letter-spacing: 0;
          line-height: 1.5;
          word-break: keep-all;
          overflow-wrap: anywhere;
        }
        button,
        input,
        select,
        textarea {
          font: inherit;
          letter-spacing: 0;
        }
        .app-shell {
          font-family: inherit;
          letter-spacing: 0;
        }
        .tabular-nums {
          font-variant-numeric: tabular-nums;
        }
        .availability-cell {
          position: relative;
          height: 28px;
          transform: translateZ(0);
          transition:
            background-color 220ms cubic-bezier(0.2, 0, 0, 1),
            border-color 220ms cubic-bezier(0.2, 0, 0, 1),
            box-shadow 220ms cubic-bezier(0.2, 0, 0, 1),
            transform 220ms cubic-bezier(0.2, 0, 0, 1);
          will-change: background-color, transform;
        }
        .availability-cell:hover {
          transform: scale(1.018);
          z-index: 1;
        }
        .availability-cell.is-available {
          box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.22);
        }
        .availability-cell.wave-fill {
          animation: waveFill 720ms cubic-bezier(0.16, 1, 0.3, 1) both;
          animation-delay: var(--wave-delay, 0ms);
        }
        .availability-cell.wave-fill::after {
          content: "";
          position: absolute;
          inset: 2px;
          border-radius: 6px;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent);
          opacity: 0;
          pointer-events: none;
          animation: waveShimmer 720ms cubic-bezier(0.16, 1, 0.3, 1) both;
          animation-delay: var(--wave-delay, 0ms);
        }
        .fade-in { animation: fadeIn 0.3s ease-out; }
        .animate-fade-in { animation: fadeIn 0.6s ease-out both; }
        .animate-fade-up { animation: fadeUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) both; }
        .animate-slide-up { animation: slideUp 0.9s cubic-bezier(0.16, 1, 0.3, 1) both; }
        .animate-slide-in-left { animation: slideInLeft 0.8s cubic-bezier(0.16, 1, 0.3, 1) both; }
        .animate-slide-in-right { animation: slideInRight 0.8s cubic-bezier(0.16, 1, 0.3, 1) both; }
        .animate-word-pop {
          opacity: 0;
          animation: wordPop 0.9s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }
        .delay-100 { animation-delay: 100ms; }
        .delay-200 { animation-delay: 200ms; }
        .delay-300 { animation-delay: 300ms; }
        .delay-500 { animation-delay: 500ms; }
        .delay-700 { animation-delay: 700ms; }
        .delay-900 { animation-delay: 900ms; }
        @keyframes waveFill {
          0% {
            transform: scale(0.92);
            filter: saturate(0.75);
            box-shadow: inset 0 0 0 1px rgba(0, 102, 204, 0);
          }
          45% {
            transform: scale(1.045);
            filter: saturate(1.2);
            box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.38), 0 0 0 3px rgba(0, 102, 204, 0.12);
          }
          100% {
            transform: scale(1);
            filter: saturate(1);
            box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.22);
          }
        }
        @keyframes waveShimmer {
          0% {
            opacity: 0;
            transform: translateX(-35%);
          }
          38% {
            opacity: 1;
          }
          100% {
            opacity: 0;
            transform: translateX(35%);
          }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(5px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(60px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideInLeft {
          from { opacity: 0; transform: translateX(-40px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(40px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes wordPop {
          0% {
            opacity: 0;
            transform: translateY(60px) scale(0.7) rotate(-4deg);
            filter: blur(8px);
          }
          72% {
            opacity: 1;
            transform: translateY(-4px) scale(1.03) rotate(1deg);
            filter: blur(0);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1) rotate(0);
            filter: blur(0);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .availability-cell,
          .availability-cell.wave-fill,
          .availability-cell.wave-fill::after,
          .fade-in,
          .animate-fade-in,
          .animate-fade-up,
          .animate-slide-up,
          .animate-slide-in-left,
          .animate-slide-in-right,
          .animate-word-pop {
            animation: none;
            transition-duration: 0ms;
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
