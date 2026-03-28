import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, ChevronLeft, Check, PlusCircle, MinusCircle, Utensils, Sparkles, Loader2, X, CheckCircle2, Circle, Volume2, Activity, Info } from 'lucide-react';

export default function App() {
  // 사용자가 새로 발급받은 API 키 적용
  const API_KEY = "AIzaSyBu2ZkHwpB6mSKc4q4djel03CIwNDlDMpQ"; 

  const [recipes, setRecipes] = useState(() => {
    const saved = localStorage.getItem('lunchbox_recipes');
    return saved ? JSON.parse(saved) : [];
  });
  const [currentView, setCurrentView] = useState('list');
  const [editingRecipe, setEditingRecipe] = useState(null);
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [aiInput, setAiInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [playingRecipeId, setPlayingRecipeId] = useState(null);

  useEffect(() => {
    localStorage.setItem('lunchbox_recipes', JSON.stringify(recipes));
  }, [recipes]);

  const callAi = async (prompt, system) => {
    // 가장 성능이 좋고 안정적인 gemini-2.0-flash 모델 경로를 사용합니다.
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        systemInstruction: { parts: [{ text: system }] },
        generationConfig: { 
          responseMimeType: "application/json",
          temperature: 0.7 
        }
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || "AI 호출 실패");
    }
    
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("AI 응답이 비어있습니다.");
    return JSON.parse(text);
  };

  const handleGenerateAiRecipe = async () => {
    if (!aiInput.trim()) return;
    setIsGenerating(true);
    try {
      const system = "도시락 레시피 전문가입니다. JSON으로만 답하세요. 키: title, ingredients(문자열 배열), steps(문자열 배열)";
      const parsed = await callAi(`${aiInput} 재료로 맛있는 도시락 레시피 만들어줘.`, system);
      
      const newRecipe = {
        id: Date.now().toString(),
        title: parsed.title,
        ingredients: (parsed.ingredients || []).map(ing => ({ text: ing, checked: false })),
        steps: parsed.steps || [],
        createdAt: Date.now()
      };
      setEditingRecipe(newRecipe);
      setCurrentView('edit');
      setIsAiModalOpen(false);
      setAiInput('');
    } catch (e) {
      alert("AI 생성 실패: " + e.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAnalyzeNutrition = async () => {
    if (!editingRecipe || editingRecipe.ingredients.length === 0) return;
    setIsAnalyzing(true);
    try {
      const system = "영양 분석 전문가입니다. JSON으로만 답하세요. 키: calories(숫자), protein(숫자), carbs(숫자), fat(숫자), tip(문자열)";
      const user = `다음 재료들의 영양 분석: ${editingRecipe.ingredients.map(i => i.text).join(', ')}`;
      const parsed = await callAi(user, system);
      setEditingRecipe({ ...editingRecipe, nutrition: parsed });
    } catch (e) {
      alert("분석 실패: " + e.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handlePlayAudio = (recipe, e) => {
    e.stopPropagation();
    if (playingRecipeId === recipe.id) {
      window.speechSynthesis.cancel();
      setPlayingRecipeId(null);
      return;
    }
    setPlayingRecipeId(recipe.id);
    const text = `${recipe.title}. 만드는 방법 안내입니다. ${recipe.steps.join('. ')}`;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ko-KR';
    utterance.onend = () => setPlayingRecipeId(null);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  const handleBackToList = () => {
    if (editingRecipe) {
      const cleaned = { 
        ...editingRecipe, 
        ingredients: editingRecipe.ingredients.filter(i => i.text.trim()), 
        steps: editingRecipe.steps.filter(s => s.trim()) 
      };
      if (cleaned.title || cleaned.ingredients.length) {
        setRecipes(prev => {
          const idx = prev.findIndex(r => r.id === cleaned.id);
          const next = [...prev];
          if (idx >= 0) next[idx] = cleaned; else next.push(cleaned);
          return next.sort((a, b) => b.createdAt - a.createdAt);
        });
      }
    }
    setCurrentView('list');
    setEditingRecipe(null);
  };

  const renderEditor = () => (
    <div className="flex flex-col h-full bg-slate-50 font-sans">
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b sticky top-0 z-10">
        <button onClick={handleBackToList} className="p-2 text-slate-400"><ChevronLeft size={24} /></button>
        <button onClick={handleBackToList} className="px-6 py-2 bg-slate-900 text-white font-bold rounded-full text-sm">저장</button>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        <input type="text" value={editingRecipe.title} onChange={(e) => setEditingRecipe({ ...editingRecipe, title: e.target.value })} placeholder="도시락 제목 입력" className="w-full text-2xl font-black bg-transparent outline-none border-none focus:ring-0 text-slate-800" />
        <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-slate-800">재료 목록</h3>
            <button onClick={() => setEditingRecipe({ ...editingRecipe, ingredients: [...editingRecipe.ingredients, { text: '', checked: false }] })} className="text-sky-500 text-xs font-bold bg-sky-50 px-3 py-1 rounded-full">+ 추가</button>
          </div>
          <div className="space-y-3">
            {editingRecipe.ingredients.map((ing, i) => (
              <div key={i} className="flex items-center gap-2">
                <input type="text" value={ing.text} onChange={(e) => {
                  const next = [...editingRecipe.ingredients];
                  next[i].text = e.target.value;
                  setEditingRecipe({ ...editingRecipe, ingredients: next });
                }} className="flex-1 bg-slate-50 rounded-xl px-4 py-2 text-sm outline-none border-none focus:ring-1 focus:ring-sky-200" placeholder="예: 계란 1개" />
                <button onClick={() => setEditingRecipe({ ...editingRecipe, ingredients: editingRecipe.ingredients.filter((_, idx) => idx !== i) })} className="text-slate-300 px-1">×</button>
              </div>
            ))}
          </div>
          <button onClick={handleAnalyzeNutrition} disabled={isAnalyzing} className="w-full mt-5 py-3.5 bg-sky-50 text-sky-600 rounded-2xl text-xs font-bold border border-sky-100 flex items-center justify-center gap-2">
            {isAnalyzing ? <Loader2 size={16} className="animate-spin" /> : <Activity size={16} />} AI 영양 성분 분석
          </button>
          {editingRecipe.nutrition && (
            <div className="mt-4 p-4 bg-slate-50 rounded-2xl text-[12px] text-slate-600 border border-slate-100">
              <div className="font-bold flex justify-between text-slate-700 mb-1">
                <span>🔥 {editingRecipe.nutrition.calories}kcal</span>
                <span>💪 {editingRecipe.nutrition.protein}g</span>
                <span>🍞 {editingRecipe.nutrition.carbs}g</span>
                <span>🥑 {editingRecipe.nutrition.fat}g</span>
              </div>
              <p className="text-sky-600 font-medium">💡 {editingRecipe.nutrition.tip}</p>
            </div>
          )}
        </div>
        <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-slate-800">조리법</h3>
            <button onClick={() => setEditingRecipe({ ...editingRecipe, steps: [...editingRecipe.steps, ''] })} className="text-sky-500 text-xs font-bold bg-sky-50 px-3 py-1 rounded-full">+ 추가</button>
          </div>
          <div className="space-y-4">
            {editingRecipe.steps.map((step, i) => (
              <div key={i} className="flex gap-3">
                <span className="w-6 h-6 bg-slate-100 text-[10px] font-bold flex items-center justify-center rounded-full mt-1 flex-shrink-0">{i+1}</span>
                <textarea value={step} onChange={(e) => {
                  const next = [...editingRecipe.steps];
                  next[i] = e.target.value;
                  setEditingRecipe({ ...editingRecipe, steps: next });
                }} className="flex-1 bg-slate-50 rounded-2xl px-4 py-2.5 text-sm outline-none resize-none border-none focus:ring-1 focus:ring-sky-200" rows={2} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  const renderList = () => (
    <div className="flex flex-col h-full bg-slate-50 font-sans">
      <div className="px-6 pt-12 pb-8 bg-white rounded-b-[3rem] shadow-sm border-b border-slate-50">
        <h1 className="text-3xl font-black text-slate-800 tracking-tighter">나만의 도시락</h1>
        <p className="text-slate-400 text-sm font-medium mt-1">오늘의 레시피를 기록하세요 ✨</p>
      </div>
      <div className="flex-1 overflow-y-auto px-5 pb-24 space-y-4 pt-6">
        {recipes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-slate-300">
            <Utensils size={64} strokeWidth={1} className="mb-4" />
            <p className="text-sm font-bold">도시락이 비어있어요!</p>
          </div>
        ) : (
          recipes.map(recipe => (
            <div key={recipe.id} onClick={() => handleEdit(recipe)} className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100 cursor-pointer active:scale-95 transition-all">
              <h3 className="text-lg font-bold text-slate-800 mb-1">{recipe.title || '제목 없음'}</h3>
              <p className="text-xs text-slate-400 line-clamp-2 mb-4 leading-relaxed">{recipe.steps.join(' ')}</p>
              <div className="flex justify-between items-center">
                <div className="flex gap-1 overflow-hidden">
                  {recipe.ingredients.slice(0, 2).map((ing, i) => (
                    <span key={i} className="bg-slate-50 text-[10px] text-slate-500 px-2.5 py-1 rounded-full border border-slate-100">{ing.text}</span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button onClick={(e) => handlePlayAudio(recipe, e)} className="p-2.5 bg-sky-50 text-sky-500 rounded-full active:bg-sky-100">
                    <Volume2 size={18} className={playingRecipeId === recipe.id ? "animate-pulse" : ""} />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); if(confirm('삭제하시겠습니까?')) setRecipes(recipes.filter(r => r.id !== recipe.id)); }} className="p-2.5 text-slate-200 hover:text-red-400">
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
      <div className="fixed bottom-10 left-0 right-0 px-6 flex justify-center gap-4 pointer-events-none">
        <button onClick={() => setIsAiModalOpen(true)} className="pointer-events-auto h-16 px-8 bg-white border border-slate-200 rounded-full shadow-2xl flex items-center gap-3 font-bold text-slate-700 active:scale-95 transition-transform">
          <Sparkles size={22} className="text-sky-500" /> AI 추천
        </button>
        <button onClick={() => { setEditingRecipe({ id: Date.now().toString(), title: '', ingredients: [{ text: '', checked: false }], steps: [''], createdAt: Date.now() }); setCurrentView('edit'); }} className="pointer-events-auto w-16 h-16 bg-sky-500 text-white rounded-full shadow-2xl flex items-center justify-center active:scale-95 transition-transform">
          <Plus size={32} />
        </button>
      </div>
    </div>
  );

  return (
    <div className="w-full h-screen max-w-md mx-auto bg-slate-50 shadow-2xl relative overflow-hidden">
      {currentView === 'list' ? renderList() : renderEditor()}
      {isAiModalOpen && (
        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-6">
          <div className="bg-white rounded-[3rem] w-full p-8 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-black text-xl text-slate-800 flex items-center gap-2"><Sparkles size={24} className="text-sky-500" /> AI 레시피</h3>
              <button onClick={() => setIsAiModalOpen(false)} className="bg-slate-50 p-2.5 rounded-full text-slate-400"><X size={20} /></button>
            </div>
            <textarea value={aiInput} onChange={(e) => setAiInput(e.target.value)} placeholder="재료를 입력하세요 (예: 계란, 참치)" className="w-full h-40 bg-slate-50 rounded-[2rem] p-6 text-sm outline-none resize-none mb-6 border-none focus:ring-2 focus:ring-sky-100" />
            <button onClick={handleGenerateAiRecipe} disabled={isGenerating || !aiInput.trim()} className="w-full py-5 bg-slate-900 text-white font-black rounded-[2rem] flex justify-center items-center gap-3 active:scale-95 transition-transform">
              {isGenerating ? <Loader2 size={24} className="animate-spin" /> : "생성하기"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
