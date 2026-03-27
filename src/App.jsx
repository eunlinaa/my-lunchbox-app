import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, ChevronLeft, Check, PlusCircle, MinusCircle, Utensils, Sparkles, Loader2, X, CheckCircle2, Circle, Volume2, Activity, Info } from 'lucide-react';

export default function App() {
  const API_KEY = "AIzaSyD4oWNHHtDl96hsgqvsyME30hdoGjMUI4Y"; 

  const [recipes, setRecipes] = useState(() => {
    const saved = localStorage.getItem('lunchbox_recipes');
    return saved ? JSON.parse(saved) : [];
  });
  const [currentView, setCurrentView] = useState('list');
  const [editingRecipe, setEditingRecipe] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [aiInput, setAiInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [playingRecipeId, setPlayingRecipeId] = useState(null);

  useEffect(() => {
    localStorage.setItem('lunchbox_recipes', JSON.stringify(recipes));
  }, [recipes]);

  const updateEditingRecipe = (newRecipe) => {
    setEditingRecipe(newRecipe);
    setIsSaving(true);
    setTimeout(() => setIsSaving(false), 500);
  };

  const handlePlayAudio = (recipe, e) => {
    e.stopPropagation();
    if (playingRecipeId === recipe.id) {
      window.speechSynthesis.cancel();
      setPlayingRecipeId(null);
      return;
    }
    setPlayingRecipeId(recipe.id);
    const text = `도시락 이름은 ${recipe.title || '이름 없는 레시피'} 입니다. 조리법을 안내해 드릴게요. ` + recipe.steps.filter(s => s.trim()).map((s, i) => `${i + 1}번. ${s}`).join(' ');
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ko-KR';
    utterance.onend = () => setPlayingRecipeId(null);
    utterance.onerror = () => setPlayingRecipeId(null);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  const handleAnalyzeNutrition = async () => {
    if (!API_KEY) return alert("API 키를 입력해주세요.");
    if (!editingRecipe || editingRecipe.ingredients.length === 0) return;
    setIsAnalyzing(true);
    try {
      const payload = {
        contents: [{ parts: [{ text: `다음 재료들의 총 영양 성분을 추정하고 조언을 제공해주세요: ${editingRecipe.ingredients.map(i => i.text).join(', ')}` }] }],
        systemInstruction: { parts: [{ text: "영양학 전문가로서 JSON으로만 응답하세요. 키: calories, protein, carbs, fat, tip" }] },
        generationConfig: { responseMimeType: "application/json" }
      };
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      const data = await res.json();
      const parsed = JSON.parse(data.candidates[0].content.parts[0].text);
      updateEditingRecipe({ ...editingRecipe, nutrition: parsed });
    } catch (error) {
      alert("영양 분석 중 오류가 발생했습니다.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleGenerateAiRecipe = async () => {
    if (!aiInput.trim()) return;
    setIsGenerating(true);
    try {
      const payload = {
        contents: [{ parts: [{ text: `${aiInput} 재료로 도시락 레시피 만들어줘.` }] }],
        systemInstruction: { parts: [{ text: "도시락 전문가로서 JSON으로만 응답하세요. 키: title, ingredients(배열), steps(배열)" }] },
        generationConfig: { responseMimeType: "application/json" }
      };
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      const parsed = JSON.parse(data.candidates[0].content.parts[0].text);
      const newRecipe = {
        id: Date.now().toString(),
        title: parsed.title,
        ingredients: parsed.ingredients.map(ing => ({ text: ing, checked: false })),
        steps: parsed.steps,
        createdAt: Date.now()
      };
      setEditingRecipe(newRecipe);
      setCurrentView('edit');
      setIsAiModalOpen(false);
      setAiInput('');
    } catch (error) {
      alert("AI 레시피 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAddNew = () => {
    setEditingRecipe({ id: Date.now().toString(), title: '', ingredients: [{ text: '', checked: false }], steps: [''], createdAt: Date.now() });
    setCurrentView('edit');
  };

  const handleEdit = (recipe) => {
    setEditingRecipe(JSON.parse(JSON.stringify(recipe)));
    setCurrentView('edit');
  };

  const handleDelete = (id, e) => {
    e.stopPropagation();
    setRecipes(recipes.filter(r => r.id !== id));
  };

  const handleBackToList = () => {
    if (editingRecipe) {
      const cleaned = { ...editingRecipe, ingredients: editingRecipe.ingredients.filter(i => i.text.trim()), steps: editingRecipe.steps.filter(s => s.trim()) };
      if (cleaned.title || cleaned.ingredients.length || cleaned.steps.length) {
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
    <div className="flex flex-col h-full bg-slate-50">
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-slate-200 sticky top-0 z-10">
        <button onClick={handleBackToList} className="p-2 text-slate-400 hover:text-sky-500"><ChevronLeft size={24} /></button>
        <button onClick={handleBackToList} className="px-4 py-1.5 text-sm bg-slate-900 text-white font-medium rounded-full">완료</button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-6 space-y-8">
        <input type="text" value={editingRecipe.title} onChange={(e) => updateEditingRecipe({ ...editingRecipe, title: e.target.value })} placeholder="도시락 이름" className="w-full text-2xl font-bold text-slate-800 bg-transparent outline-none border-b border-transparent focus:border-sky-200" />
        <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100">
          <div className="flex justify-between items-center mb-4">
            <label className="text-base font-bold text-slate-800">재료</label>
            <button onClick={() => updateEditingRecipe({ ...editingRecipe, ingredients: [...editingRecipe.ingredients, { text: '', checked: false }] })} className="text-sky-500 text-xs font-semibold">+ 추가</button>
          </div>
          <div className="space-y-3">
            {editingRecipe.ingredients.map((ing, i) => (
              <div key={i} className="flex items-center gap-2">
                <input type="text" value={ing.text} onChange={(e) => {
                  const next = [...editingRecipe.ingredients];
                  next[i].text = e.target.value;
                  updateEditingRecipe({ ...editingRecipe, ingredients: next });
                }} className="flex-1 bg-slate-50 rounded-xl px-3 py-2 text-sm outline-none" placeholder="예: 계란 2개" />
                <button onClick={() => updateEditingRecipe({ ...editingRecipe, ingredients: editingRecipe.ingredients.filter((_, idx) => idx !== i) })} className="text-slate-300">×</button>
              </div>
            ))}
          </div>
          <button onClick={handleAnalyzeNutrition} disabled={isAnalyzing} className="w-full mt-4 py-2 bg-sky-50 text-sky-600 rounded-xl text-xs font-bold border border-sky-100 flex justify-center items-center gap-2">
            {isAnalyzing ? <Loader2 size={14} className="animate-spin" /> : <Activity size={14} />} AI 영양 분석
          </button>
          {editingRecipe.nutrition && (
            <div className="mt-4 p-3 bg-slate-50 rounded-xl text-[11px] text-slate-600">
              {editingRecipe.nutrition.calories}kcal | 단 {editingRecipe.nutrition.protein}g | 탄 {editingRecipe.nutrition.carbs}g | 지 {editingRecipe.nutrition.fat}g
              <p className="mt-1 text-sky-600 font-medium">💡 {editingRecipe.nutrition.tip}</p>
            </div>
          )}
        </div>
        <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100">
          <div className="flex justify-between items-center mb-4">
            <label className="text-base font-bold text-slate-800">조리법</label>
            <button onClick={() => updateEditingRecipe({ ...editingRecipe, steps: [...editingRecipe.steps, ''] })} className="text-sky-500 text-xs font-semibold">+ 추가</button>
          </div>
          <div className="space-y-4">
            {editingRecipe.steps.map((step, i) => (
              <div key={i} className="flex gap-3">
                <span className="w-5 h-5 bg-slate-100 text-[10px] font-bold flex items-center justify-center rounded-full mt-2">{i+1}</span>
                <textarea value={step} onChange={(e) => {
                  const next = [...editingRecipe.steps];
                  next[i] = e.target.value;
                  updateEditingRecipe({ ...editingRecipe, steps: next });
                }} className="flex-1 bg-slate-50 rounded-xl px-3 py-2 text-sm outline-none resize-none" rows={2} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  const renderList = () => (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="px-6 pt-12 pb-6">
        <h1 className="text-3xl font-extrabold text-slate-800">나만의 도시락</h1>
        <p className="text-slate-500 text-sm">오늘도 맛있는 하루 되세요 ✨</p>
      </div>
      <div className="flex-1 overflow-y-auto px-5 pb-24 space-y-4">
        {recipes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-300">
            <Utensils size={48} className="mb-2" />
            <p className="text-sm">레시피를 추가해보세요</p>
          </div>
        ) : (
          recipes.map(recipe => (
            <div key={recipe.id} onClick={() => handleEdit(recipe)} className="bg-white p-5 rounded-[2rem] shadow-sm border border-slate-100 group cursor-pointer relative">
              <h3 className="text-lg font-bold text-slate-800 mb-2">{recipe.title || '제목 없음'}</h3>
              <p className="text-xs text-slate-400 line-clamp-2 mb-4">{recipe.steps.join(' ')}</p>
              <div className="flex justify-between items-center">
                <div className="flex gap-1">
                  {recipe.ingredients.slice(0, 3).map((ing, i) => (
                    <span key={i} className="bg-slate-50 text-[10px] text-slate-500 px-2 py-0.5 rounded-full">{ing.text}</span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button onClick={(e) => handlePlayAudio(recipe, e)} className="p-2 bg-sky-50 text-sky-500 rounded-full">
                    <Volume2 size={16} className={playingRecipeId === recipe.id ? "animate-pulse" : ""} />
                  </button>
                  <button onClick={(e) => handleDelete(recipe.id, e)} className="p-2 text-slate-300 hover:text-red-500">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
      <div className="fixed bottom-8 left-0 right-0 px-6 flex justify-center gap-3 pointer-events-none">
        <button onClick={() => setIsAiModalOpen(true)} className="pointer-events-auto h-14 px-6 bg-white border border-slate-200 rounded-full shadow-lg flex items-center gap-2 font-bold text-slate-700">
          <Sparkles size={20} className="text-sky-500" /> AI 추천
        </button>
        <button onClick={handleAddNew} className="pointer-events-auto w-14 h-14 bg-sky-500 text-white rounded-full shadow-lg flex items-center justify-center">
          <Plus size={28} />
        </button>
      </div>
    </div>
  );

  return (
    <div className="w-full h-screen max-w-md mx-auto bg-slate-50 shadow-2xl relative overflow-hidden">
      {currentView === 'list' ? renderList() : renderEditor()}
      {isAiModalOpen && (
        <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="bg-white rounded-[2.5rem] w-full p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-slate-800 flex items-center gap-2"><Sparkles size={18} className="text-sky-500" /> AI 레시피</h3>
              <button onClick={() => setIsAiModalOpen(false)}><X size={20} className="text-slate-400" /></button>
            </div>
            <textarea value={aiInput} onChange={(e) => setAiInput(e.target.value)} placeholder="냉장고에 남은 재료를 적어주세요 (예: 두부, 계란)" className="w-full h-32 bg-slate-50 rounded-2xl p-4 text-sm outline-none resize-none mb-4" />
            <button onClick={handleGenerateAiRecipe} disabled={isGenerating || !aiInput.trim()} className="w-full py-4 bg-slate-900 text-white font-bold rounded-2xl flex justify-center items-center gap-2">
              {isGenerating ? <Loader2 size={20} className="animate-spin" /> : "레시피 만들기"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
