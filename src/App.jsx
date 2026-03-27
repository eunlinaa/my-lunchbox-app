import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, ChevronLeft, Check, PlusCircle, MinusCircle, Utensils, Sparkles, Loader2, X, CheckCircle2, Circle, Volume2, Activity, Info } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';

// Firebase 초기화
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

export default function App() {
  const [user, setUser] = useState(null);
  const [recipes, setRecipes] = useState([]);
  const [currentView, setCurrentView] = useState('list'); // 'list', 'edit'
  const [editingRecipe, setEditingRecipe] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  // AI 기능 관련 상태
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [aiInput, setAiInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  // 신규 AI 기능 관련 상태
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [playingRecipeId, setPlayingRecipeId] = useState(null);

  // 1. Firebase 인증 초기화
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("인증 오류:", error);
      }
    };
    initAuth();
    
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // 2. 클라우드에서 레시피 데이터 실시간 불러오기
  useEffect(() => {
    if (!user) return;
    
    const recipesRef = collection(db, 'artifacts', appId, 'users', user.uid, 'recipes');
    const unsubscribe = onSnapshot(recipesRef, (snapshot) => {
      const fetchedRecipes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // 최신순 정렬
      fetchedRecipes.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setRecipes(fetchedRecipes);
    }, (error) => {
      console.error("데이터 불러오기 오류:", error);
    });

    return () => unsubscribe();
  }, [user]);

  // 3. 편집 중인 레시피 자동 저장 (디바운스 적용)
  useEffect(() => {
    if (!editingRecipe || !user) return;
    
    setIsSaving(true);
    const timer = setTimeout(async () => {
      try {
        const recipeRef = doc(db, 'artifacts', appId, 'users', user.uid, 'recipes', editingRecipe.id);
        await setDoc(recipeRef, editingRecipe);
      } catch (e) {
        console.error("저장 오류:", e);
      } finally {
        setIsSaving(false);
      }
    }, 1000); // 1초 대기 후 클라우드에 저장
    
    return () => clearTimeout(timer);
  }, [editingRecipe, user]);

  const updateEditingRecipe = (newRecipe) => {
    setEditingRecipe(newRecipe);
  };

  const convertPcmToWav = (base64Data, sampleRate = 24000) => {
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    const pcmData = new Int16Array(bytes.buffer);

    const numChannels = 1;
    const bitsPerSample = 16;
    const dataSize = pcmData.length * 2;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    const writeString = (offset, string) => {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * (bitsPerSample / 8), true);
    view.setUint16(32, numChannels * (bitsPerSample / 8), true);
    view.setUint16(34, bitsPerSample, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    for (let i = 0; i < pcmData.length; i++) {
        view.setInt16(44 + i * 2, pcmData[i], true);
    }

    return new Blob([view], { type: 'audio/wav' });
  };

  const handlePlayAudio = async (recipe, e) => {
    e.stopPropagation();
    if (playingRecipeId === recipe.id) return; // 이미 재생중이면 무시
    
    setPlayingRecipeId(recipe.id);
    try {
      const apiKey = "";
      const text = `도시락 이름은 ${recipe.title || '이름 없는 레시피'} 입니다. 조리법을 안내해 드릴게요. ` + recipe.steps.filter(s => s.trim()).map((s, i) => `${i + 1}번. ${s}`).join(' ');

      const payload = {
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } // 부드러운 한국어 음성
          }
        },
        model: "gemini-2.5-flash-preview-tts"
      };

      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`;

      const data = await fetchWithRetry(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const inlineData = data.candidates?.[0]?.content?.parts?.[0]?.inlineData;
      if (!inlineData) throw new Error("음성 데이터를 가져오지 못했습니다.");

      const mimeType = inlineData.mimeType;
      const rateMatch = mimeType.match(/rate=(\d+)/);
      const sampleRate = rateMatch ? parseInt(rateMatch[1], 10) : 24000;

      const wavBlob = convertPcmToWav(inlineData.data, sampleRate);
      const audioUrl = URL.createObjectURL(wavBlob);
      const audio = new Audio(audioUrl);

      audio.onended = () => {
        setPlayingRecipeId(null);
        URL.revokeObjectURL(audioUrl);
      };

      await audio.play();
    } catch (err) {
      console.error("TTS 오류:", err);
      alert("음성 생성 중 오류가 발생했습니다.");
      setPlayingRecipeId(null);
    }
  };

  const handleAnalyzeNutrition = async () => {
    if (!editingRecipe || editingRecipe.ingredients.length === 0) return;
    const validIngredients = editingRecipe.ingredients.filter(i => i.text.trim() !== '').map(i => i.text);
    if (validIngredients.length === 0) {
      alert("재료를 먼저 입력해주세요!");
      return;
    }

    setIsAnalyzing(true);
    try {
      const apiKey = "";
      const prompt = `다음 재료들의 총 영양 성분을 추정하고 조언을 제공해주세요: ${validIngredients.join(', ')}`;
      const systemInstruction = "당신은 영양학 전문가입니다. 주어진 식재료 목록을 보고 전체 요리의 대략적인 영양 성분(칼로리, 단백질, 탄수화물, 지방)을 계산하고, 이 도시락에 대한 짧고 유용한 건강 팁을 제공하세요. 응답은 반드시 JSON 형식이어야 합니다.";
      
      const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        systemInstruction: { parts: [{ text: systemInstruction }] },
        generationConfig: { 
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              calories: { type: "NUMBER", description: "총 칼로리 (kcal)" },
              protein: { type: "NUMBER", description: "단백질 (g)" },
              carbs: { type: "NUMBER", description: "탄수화물 (g)" },
              fat: { type: "NUMBER", description: "지방 (g)" },
              tip: { type: "STRING", description: "영양학적 조언 (1-2문장)" }
            },
            required: ["calories", "protein", "carbs", "fat", "tip"]
          }
        }
      };

      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
      const data = await fetchWithRetry(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error("응답 텍스트가 없습니다.");
      
      const parsed = JSON.parse(text);
      updateEditingRecipe({ ...editingRecipe, nutrition: parsed });

    } catch (error) {
      console.error("영양 분석 오류:", error);
      alert('영양 분석 중 오류가 발생했습니다.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const fetchWithRetry = async (url, options, retries = 5) => {
    let delay = 1000;
    for (let i = 0; i < retries; i++) {
      try {
        const res = await fetch(url, options);
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        return await res.json();
      } catch (err) {
        if (i === retries - 1) throw err;
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2;
      }
    }
  };

  const handleGenerateAiRecipe = async () => {
    if (!aiInput.trim() || !user) return;
    setIsGenerating(true);
    try {
      const apiKey = "";
      const prompt = `다음 재료를 활용한 맛있고 간단한 도시락 레시피를 만들어주세요. 각 조리 단계마다 약 몇 분 정도 조리해야 하는지 대략적인 소요 시간도 함께 알려주세요: ${aiInput}`;
      const systemInstruction = "당신은 도시락 레시피 전문가입니다. 사용자가 제공한 재료를 활용하여 만들 수 있는 간편하고 맛있는 도시락 레시피를 제안해주세요. 설명은 친절하게 하되, 응답은 반드시 JSON 형식으로만 해야 합니다. JSON은 다음 키를 가져야 합니다: title (문자열, 레시피 이름), ingredients (문자열 배열, 재료와 양), steps (문자열 배열, 조리 과정 - 각 단계별 예상 소요 시간 포함).";

      const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        systemInstruction: { parts: [{ text: systemInstruction }] },
        generationConfig: { 
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              title: { type: "STRING" },
              ingredients: { type: "ARRAY", items: { type: "STRING" } },
              steps: { type: "ARRAY", items: { type: "STRING" } }
            },
            required: ["title", "ingredients", "steps"]
          }
        }
      };

      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
      
      const data = await fetchWithRetry(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error("응답 텍스트가 없습니다.");
      
      const parsed = JSON.parse(text);

      const newRecipeId = Date.now().toString();
      const newRecipe = {
        id: newRecipeId,
        title: parsed.title,
        ingredients: parsed.ingredients.map(ing => ({ text: ing, checked: false })),
        steps: parsed.steps,
        createdAt: Date.now()
      };

      // Firestore에 즉시 저장 후 편집 화면으로 이동
      const recipeRef = doc(db, 'artifacts', appId, 'users', user.uid, 'recipes', newRecipeId);
      await setDoc(recipeRef, newRecipe);

      setEditingRecipe(newRecipe);
      setCurrentView('edit');
      setIsAiModalOpen(false);
      setAiInput('');
    } catch (error) {
      console.error(error);
      alert('레시피 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAddNew = () => {
    const newRecipe = {
      id: Date.now().toString(),
      title: '',
      ingredients: [{ text: '', checked: false }],
      steps: [''],
      createdAt: Date.now()
    };
    
    setEditingRecipe(newRecipe);
    setCurrentView('edit');
  };

  const handleEdit = (recipe) => {
    setEditingRecipe(JSON.parse(JSON.stringify(recipe)));
    setCurrentView('edit');
  };

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'recipes', id));
    } catch (error) {
      console.error("삭제 오류:", error);
    }
  };

  const handleBackToList = async () => {
    if (!user || !editingRecipe) {
      setCurrentView('list');
      setEditingRecipe(null);
      return;
    }

    // 빈 항목 정리
    const cleanedRecipe = {
      ...editingRecipe,
      ingredients: editingRecipe.ingredients.filter(i => i.text.trim() !== ''),
      steps: editingRecipe.steps.filter(s => s.trim() !== '')
    };

    const isEmpty = cleanedRecipe.title.trim() === '' && cleanedRecipe.ingredients.length === 0 && cleanedRecipe.steps.length === 0;
    const recipeRef = doc(db, 'artifacts', appId, 'users', user.uid, 'recipes', editingRecipe.id);
    
    try {
      if (isEmpty) {
        // 내용이 없으면 클라우드에서 삭제
        await deleteDoc(recipeRef);
      } else {
        // 내용이 있으면 정리된 데이터로 최종 업데이트
        await setDoc(recipeRef, cleanedRecipe);
      }
    } catch (error) {
      console.error("완료 처리 중 오류:", error);
    }

    setCurrentView('list');
    setEditingRecipe(null);
  };

  // --- 레시피 편집기 렌더링 ---
  const renderEditor = () => {
    const updateIngredient = (index, value) => {
      const newIngredients = [...editingRecipe.ingredients];
      newIngredients[index] = { ...newIngredients[index], text: value };
      updateEditingRecipe({ ...editingRecipe, ingredients: newIngredients });
    };

    const toggleIngredientCheck = (index) => {
      const newIngredients = [...editingRecipe.ingredients];
      newIngredients[index] = { ...newIngredients[index], checked: !newIngredients[index].checked };
      updateEditingRecipe({ ...editingRecipe, ingredients: newIngredients });
    };

    const addIngredient = () => {
      updateEditingRecipe({ ...editingRecipe, ingredients: [...editingRecipe.ingredients, { text: '', checked: false }] });
    };

    const removeIngredient = (index) => {
      const newIngredients = editingRecipe.ingredients.filter((_, i) => i !== index);
      updateEditingRecipe({ ...editingRecipe, ingredients: newIngredients.length ? newIngredients : [{ text: '', checked: false }] });
    };

    const updateStep = (index, value) => {
      const newSteps = [...editingRecipe.steps];
      newSteps[index] = value;
      updateEditingRecipe({ ...editingRecipe, steps: newSteps });
    };

    const addStep = () => {
      updateEditingRecipe({ ...editingRecipe, steps: [...editingRecipe.steps, ''] });
    };

    const removeStep = (index) => {
      const newSteps = editingRecipe.steps.filter((_, i) => i !== index);
      updateEditingRecipe({ ...editingRecipe, steps: newSteps.length ? newSteps : [''] });
    };

    return (
      <div className="flex flex-col h-full bg-slate-50 animate-in fade-in slide-in-from-bottom-4">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-4 py-3 bg-white/80 backdrop-blur-md border-b border-slate-200/50 sticky top-0 z-10">
          <button onClick={handleBackToList} className="p-2 text-slate-400 hover:text-sky-500 transition-colors rounded-full hover:bg-slate-100/50">
            <ChevronLeft size={24} />
          </button>
          <div className="flex flex-col items-center">
            {isSaving ? (
              <span className="text-xs text-slate-400 font-medium tracking-wide flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> 저장 중</span>
            ) : (
              <span className="text-xs text-sky-500 font-semibold tracking-wide bg-sky-50 px-2 py-0.5 rounded-full">클라우드 저장됨</span>
            )}
          </div>
          <button onClick={handleBackToList} className="px-4 py-1.5 text-sm bg-slate-900 text-white hover:bg-slate-800 font-medium rounded-full flex items-center gap-1.5 transition-colors shadow-sm">
            <Check size={16} />
            <span>완료</span>
          </button>
        </div>

        {/* 폼 내용 */}
        <div className="flex-1 overflow-y-auto px-5 py-6 space-y-8">
          {/* 제목 입력 */}
          <div>
            <input
              type="text"
              value={editingRecipe.title}
              onChange={(e) => updateEditingRecipe({ ...editingRecipe, title: e.target.value })}
              placeholder="도시락 이름을 입력하세요"
              className="w-full text-2xl font-bold text-slate-800 placeholder:text-slate-300 bg-transparent outline-none py-2 border-b border-transparent focus:border-sky-200 transition-colors"
            />
          </div>

          {/* 재료 입력 */}
          <div className="bg-white p-5 rounded-3xl shadow-[0_2px_20px_-8px_rgba(0,0,0,0.05)] border border-slate-100">
            <div className="flex justify-between items-center mb-4">
              <label className="text-base font-bold text-slate-800 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400"></span>
                재료 목록
              </label>
              <button onClick={addIngredient} className="text-sky-500 hover:text-sky-600 bg-sky-50 hover:bg-sky-100 px-3 py-1.5 rounded-full flex items-center gap-1.5 text-xs font-semibold transition-colors">
                <PlusCircle size={14} /> 재료 추가
              </button>
            </div>
            <div className="space-y-2.5">
              {editingRecipe.ingredients.map((ing, index) => (
                <div key={index} className="flex items-center gap-3 group">
                  <button 
                    onClick={() => toggleIngredientCheck(index)}
                    className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center transition-all ${ing.checked ? 'text-sky-500 bg-sky-50' : 'text-slate-300 hover:text-sky-400 bg-slate-50'}`}
                  >
                    {ing.checked ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                  </button>
                  <input
                    type="text"
                    value={ing.text}
                    onChange={(e) => updateIngredient(index, e.target.value)}
                    placeholder="예: 계란 2개"
                    className={`flex-1 bg-transparent border-b border-slate-100 py-2 text-[15px] focus:border-sky-300 outline-none transition-all placeholder:text-slate-300 ${ing.checked ? 'line-through text-slate-400' : 'text-slate-700'}`}
                  />
                  <button onClick={() => removeIngredient(index)} className="text-slate-300 hover:text-red-500 p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <MinusCircle size={18} />
                </button>
              </div>
            ))}
          </div>

          {/* 영양 분석 버튼 및 결과 */}
          <div className="mt-5 pt-5 border-t border-slate-100">
            {!editingRecipe.nutrition ? (
              <button 
                onClick={handleAnalyzeNutrition}
                disabled={isAnalyzing}
                className="w-full py-3 bg-slate-50 hover:bg-sky-50 text-slate-600 hover:text-sky-600 rounded-2xl border border-slate-200 hover:border-sky-200 transition-colors flex items-center justify-center gap-2 text-sm font-bold disabled:opacity-50"
              >
                {isAnalyzing ? (
                  <><Loader2 size={16} className="animate-spin" /> 성분 분석 중...</>
                ) : (
                  <><Activity size={16} /> AI 영양 성분 분석 ✨</>
                )}
              </button>
            ) : (
              <div className="bg-gradient-to-br from-sky-50 to-indigo-50 rounded-2xl p-4 border border-sky-100/50">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="text-sm font-bold text-sky-800 flex items-center gap-1.5"><Activity size={16} /> 예상 영양 정보</h4>
                  <button onClick={handleAnalyzeNutrition} disabled={isAnalyzing} className="text-xs text-sky-600 hover:text-sky-700 bg-white/60 px-2 py-1 rounded-md font-semibold transition-colors">
                    {isAnalyzing ? "분석 중..." : "다시 분석 ✨"}
                  </button>
                </div>
                <div className="grid grid-cols-4 gap-2 mb-3">
                  <div className="bg-white rounded-xl p-2 text-center shadow-sm">
                    <div className="text-[10px] text-slate-400 font-bold mb-0.5">칼로리</div>
                    <div className="text-sm font-extrabold text-slate-700">{editingRecipe.nutrition.calories}</div>
                  </div>
                  <div className="bg-white rounded-xl p-2 text-center shadow-sm">
                    <div className="text-[10px] text-slate-400 font-bold mb-0.5">단백질</div>
                    <div className="text-sm font-extrabold text-slate-700">{editingRecipe.nutrition.protein}g</div>
                  </div>
                  <div className="bg-white rounded-xl p-2 text-center shadow-sm">
                    <div className="text-[10px] text-slate-400 font-bold mb-0.5">탄수화물</div>
                    <div className="text-sm font-extrabold text-slate-700">{editingRecipe.nutrition.carbs}g</div>
                  </div>
                  <div className="bg-white rounded-xl p-2 text-center shadow-sm">
                    <div className="text-[10px] text-slate-400 font-bold mb-0.5">지방</div>
                    <div className="text-sm font-extrabold text-slate-700">{editingRecipe.nutrition.fat}g</div>
                  </div>
                </div>
                <div className="bg-white/60 rounded-xl p-3 text-xs text-slate-600 leading-relaxed flex items-start gap-2">
                  <Info size={14} className="text-sky-500 flex-shrink-0 mt-0.5" />
                  <span>{editingRecipe.nutrition.tip}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 조리법 입력 */}
          <div className="bg-white p-5 rounded-3xl shadow-[0_2px_20px_-8px_rgba(0,0,0,0.05)] border border-slate-100">
            <div className="flex justify-between items-center mb-4">
              <label className="text-base font-bold text-slate-800 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400"></span>
                만드는 방법
              </label>
              <button onClick={addStep} className="text-sky-500 hover:text-sky-600 bg-sky-50 hover:bg-sky-100 px-3 py-1.5 rounded-full flex items-center gap-1.5 text-xs font-semibold transition-colors">
                <PlusCircle size={14} /> 단계 추가
              </button>
            </div>
            <div className="space-y-4">
              {editingRecipe.steps.map((step, index) => (
                <div key={index} className="flex items-start gap-3 group">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-xs font-bold mt-1.5">
                    {index + 1}
                  </span>
                  <textarea
                    ref={(el) => {
                      if (el) {
                        el.style.height = 'auto';
                        el.style.height = el.scrollHeight + 'px';
                      }
                    }}
                    value={step}
                    onChange={(e) => updateStep(index, e.target.value)}
                    placeholder="조리 과정을 상세히 적어주세요."
                    rows={1}
                    className="flex-1 bg-slate-50 border border-transparent rounded-2xl px-4 py-3 text-[15px] text-slate-700 focus:bg-white focus:border-sky-200 focus:ring-4 focus:ring-sky-50 outline-none resize-none overflow-hidden transition-colors placeholder:text-slate-400"
                  />
                  <button onClick={() => removeStep(index)} className="text-slate-300 hover:text-red-500 p-1.5 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <MinusCircle size={18} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // --- 레시피 목록 렌더링 ---
  const renderList = () => {
    return (
      <div className="flex flex-col h-full bg-slate-50">
        {/* 헤더 */}
        <div className="px-6 pt-12 pb-6 bg-slate-50 relative z-10">
          <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">나만의 도시락</h1>
          <p className="text-slate-500 text-sm mt-1 font-medium">오늘도 맛있는 하루 되세요 ✨</p>
        </div>

        {/* 리스트 영역 */}
        <div className="flex-1 overflow-y-auto px-5 pb-28 space-y-4">
          {recipes.length === 0 ? (
            <div className="text-center text-slate-400 py-20 flex flex-col items-center">
              <div className="w-20 h-20 bg-sky-50 rounded-full flex items-center justify-center mb-5">
                <Utensils size={32} className="text-sky-300" />
              </div>
              <p className="font-medium text-slate-500">아직 등록된 레시피가 없어요</p>
              <p className="text-sm mt-1">하단의 버튼을 눌러 첫 레시피를 추가해보세요</p>
            </div>
          ) : (
            recipes.map(recipe => (
              <div 
                key={recipe.id} 
                onClick={() => handleEdit(recipe)}
                className="bg-white p-5 rounded-[1.5rem] shadow-[0_2px_12px_-4px_rgba(0,0,0,0.04)] border border-slate-100 hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer group"
              >
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-[1.1rem] font-bold text-slate-800 group-hover:text-sky-500 transition-colors leading-snug">
                    {recipe.title || '제목 없음'}
                  </h3>
                  <div className="flex gap-1 bg-slate-50 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleEdit(recipe); }}
                      className="text-slate-400 hover:text-sky-500 p-1.5 rounded-full hover:bg-white transition-colors"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button 
                      onClick={(e) => handleDelete(recipe.id, e)}
                      className="text-slate-400 hover:text-red-500 p-1.5 rounded-full hover:bg-white transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                
                <div className="text-[13px] text-slate-500 mb-3 flex items-start gap-2 leading-relaxed">
                <span className="font-semibold text-sky-500 bg-sky-50 px-2 py-0.5 rounded-md flex-shrink-0">재료</span>
                <span className="flex-1 break-words">{recipe.ingredients.filter(i => i.text.trim() !== '').map(i => i.text).join(' • ') || '재료 없음'}</span>
              </div>
              
              <div className="text-[13px] text-slate-500 bg-slate-50/80 px-4 py-3 rounded-2xl leading-relaxed whitespace-pre-wrap break-words relative group/steps">
                {recipe.steps.find(s => s.trim() !== '') || '조리법 없음'}
                {recipe.steps.filter(s => s.trim() !== '').length > 1 ? '\n...' : ''}
                
                {recipe.steps.some(s => s.trim() !== '') && (
                  <button 
                    onClick={(e) => handlePlayAudio(recipe, e)}
                    disabled={playingRecipeId === recipe.id}
                    className="absolute bottom-3 right-3 bg-white/90 shadow-sm border border-slate-100 text-sky-500 px-3 py-1.5 rounded-full flex items-center gap-1.5 text-xs font-bold hover:bg-sky-50 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    {playingRecipeId === recipe.id ? (
                      <><Volume2 size={14} className="animate-pulse text-sky-400" /> 재생 중...</>
                    ) : (
                      <><Volume2 size={14} /> 조리법 듣기 ✨</>
                    )}
                  </button>
                )}
              </div>
            </div>
          ))
          )}
        </div>

        {/* 플로팅 버튼 영역 */}
        <div className="fixed bottom-8 left-0 right-0 px-6 flex justify-end items-end gap-3 z-20 pointer-events-none">
          {/* AI 레시피 생성 버튼 */}
          <button 
            onClick={() => setIsAiModalOpen(true)}
            className="pointer-events-auto h-14 px-5 bg-white text-slate-700 border border-slate-200 rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.08)] flex items-center gap-2 hover:bg-slate-50 hover:scale-[1.02] transition-all focus:outline-none"
          >
            <Sparkles size={20} className={`text-sky-500 ${isGenerating ? "animate-pulse" : ""}`} />
            <span className="font-bold text-[15px]">AI 추천</span>
          </button>

          {/* 일반 추가 버튼 */}
          <button 
            onClick={handleAddNew}
            className="pointer-events-auto w-14 h-14 bg-sky-500 text-white rounded-full shadow-[0_8px_30px_rgba(14,165,233,0.3)] flex items-center justify-center hover:bg-sky-600 hover:scale-[1.02] transition-all focus:outline-none"
          >
            <Plus size={26} />
          </button>
        </div>
      </div>
    );
  };

  if (!user) {
    return <div className="w-full h-screen max-w-md mx-auto bg-slate-50 flex items-center justify-center"><Loader2 size={32} className="animate-spin text-sky-500" /></div>;
  }

  return (
    <div className="w-full h-screen max-w-md mx-auto bg-slate-50 shadow-2xl relative overflow-hidden font-sans">
      {currentView === 'list' ? renderList() : renderEditor()}

      {/* AI 모달 오버레이 */}
      {isAiModalOpen && (
        <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm z-50 flex items-center justify-center p-5 animate-in fade-in">
          <div className="bg-white rounded-[2rem] w-full max-w-sm overflow-hidden shadow-2xl p-6">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2 bg-sky-50 text-sky-600 px-3 py-1.5 rounded-full">
                <Sparkles size={16} />
                <h3 className="font-bold text-sm">AI 레시피 생성</h3>
              </div>
              <button onClick={() => !isGenerating && setIsAiModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors bg-slate-50 p-2 rounded-full">
                <X size={18} />
              </button>
            </div>
            
            <div className="space-y-5">
              <p className="text-[15px] text-slate-600 leading-relaxed font-medium">
                냉장고에 있는 재료나 먹고 싶은 음식의 키워드를 적어주시면, AI가 뚝딱 레시피를 만들어드려요.
              </p>
              
              <textarea
                value={aiInput}
                onChange={(e) => setAiInput(e.target.value)}
                disabled={isGenerating}
                placeholder="예: 계란, 스팸, 김치"
                className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-[15px] focus:bg-white focus:border-sky-300 focus:ring-4 focus:ring-sky-50 outline-none resize-none h-28 transition-all placeholder:text-slate-400 text-slate-800"
              />
              
              <button
                onClick={handleGenerateAiRecipe}
                disabled={isGenerating || !aiInput.trim()}
                className="w-full py-4 bg-slate-900 text-white font-bold rounded-2xl shadow-md hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2 transition-colors text-[15px]"
              >
                {isGenerating ? (
                  <>
                    <Loader2 size={20} className="animate-spin" />
                    레시피 짓는 중...
                  </>
                ) : (
                  <>
                    레시피 만들기
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}