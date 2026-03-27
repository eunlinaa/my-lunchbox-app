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
    const validIngredients = editingRecipe.ingredients.filter(i => i.text.trim() !== '').map(i => i.text);
    if (validIngredients.length === 0) return alert("재료를 먼저 입력해주세요!");

    setIsAnalyzing(true);
    try {
      const payload = {
        contents: [{ parts: [{ text: `다음 재료들의 총 영양 성분을 추정하고 조언을 제공해주세요: ${validIngredients.join(', ')}` }] }],
        systemInstruction: { parts: [{ text: "당신은 영양학 전문가입니다. 전체 요리의 대략적인 영양 성분(칼로리, 단백질, 탄수화물, 지방)을 계산하고 짧은 건강 팁을 제공하세요. 응답은 반드시 JSON 형식이어야 합니다." }] },
        generationConfig: { 
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              calories: { type: "NUMBER" }, protein: { type: "NUMBER" }, carbs: { type: "NUMBER" },
              fat: { type: "NUMBER" }, tip: { type: "STRING" }
            },
            required: ["calories", "protein", "carbs", "fat", "tip"]
          }
        }
      };

      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`, {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);

      const parsed = JSON.parse(data.candidates[0].content.parts[0].text);
      updateEditingRecipe({ ...editingRecipe, nutrition: parsed });
    } catch (error) {
      alert(`에러: ${error.message}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleGenerateAiRecipe = async () => {
    if (!API_KEY) return alert("API 키를 입력해주세요.");
    if (!aiInput.trim()) return;
    setIsGenerating(true);
    try {
      const payload = {
        contents: [{ parts: [{ text: `다음 재료를 활용한 맛있고 간단한 도시락 레시피를 만들어주세요. 각 조리 단계마다 대략적인 소요 시간도 함께 알려주세요: ${aiInput}` }] }],
        systemInstruction: { parts: [{ text: "당신은 도시락 레시피 전문가입니다. JSON 형식으로만 응답하세요. 키: title(문자열), ingredients(문자열 배열), steps(문자열 배열, 소요 시간 포함)." }] },
        generationConfig: { 
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: { title: { type: "STRING" }, ingredients: { type: "ARRAY", items: { type: "STRING" } }, steps: { type: "ARRAY", items: { type: "STRING" } } },
            required: ["title", "ingredients", "steps"]
          }
        }
      };

      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`, {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify(payload)
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
      alert(`에러: ${error.message}`);
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
    if (!editingRecipe) return setCurrentView('list');

    const cleanedRecipe = {
      ...editingRecipe,
      ingredients: editingRecipe.ingredients.filter(i => i.text.trim() !== ''),
      steps: editingRecipe.steps.filter(s => s.trim() !== '')
    };

    const isEmpty = cleanedRecipe.title.trim() === '' && cleanedRecipe.ingredients.length === 0 && cleanedRecipe.steps.length === 0;
    
    let newRecipes = [...recipes];
    if (isEmpty) {
      newRecipes = newRecipes.filter(r => r.id !== editingRecipe.id);
    } else {
      const idx = newRecipes.findIndex(r => r.id === editingRecipe.id);
      if (idx >= 0) newRecipes[idx] = cleanedRecipe;
      else newRecipes.push(cleanedRecipe);
    }
    
    newRecipes.sort((a, b) => b.createdAt - a.createdAt);
    setRecipes(newRecipes);
    setCurrentView('list');
    setEditingRecipe(null);
  };

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
    const addIngredient = () => updateEditingRecipe({ ...editingRecipe, ingredients: [...editingRecipe.ingredients, { text: '', checked: false }] });
    const removeIngredient = (index) => {
      const newIngredients = editingRecipe.ingredients.filter((_, i) => i !== index);
      updateEditingRecipe({ ...editingRecipe, ingredients: newIngredients.length ? newIngredients : [{ text: '', checked: false }] });
    };
    const updateStep = (index, value) => {
      const newSteps = [...editingRecipe.steps];
      newSteps[index] = value;
      updateEditingRecipe({ ...editingRecipe, steps: newSteps });
    };
    const addStep = () => updateEditingRecipe({ ...editingRecipe, steps: [...editingRecipe.steps, ''] });
    const removeStep = (index) => {
      const newSteps = editingRecipe.steps.filter((_, i) => i !== index);
      updateEditingRecipe({ ...editingRecipe, steps: newSteps.length ? newSteps : [''] });
    };

    return (
      <div className="flex flex-col h-full bg-slate-50">
        <div className="flex items-center justify-between px-4 py-3 bg-white/80 backdrop-blur-md border-b border-slate-200/50 sticky top-0 z-10">
          <button onClick={handleBackToList} className="p-2 text-slate-400 hover:text-sky-500 transition-colors rounded-full hover:bg-slate-100/50"><ChevronLeft size={24} /></button>
          <div className="flex flex-col items-center">
            {isSaving ? <span className="text-xs text-slate-400 font-medium flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> 저장 중</span>
            : <span className="text-xs text-sky-500 font-semibold bg-sky-50 px-2 py-0.5 rounded-full">저장됨</span>}
          </div>
          <button onClick={handleBackToList} className="px-4 py-1.5 text-sm bg-slate-900 text-white hover:bg-slate-800 font-medium rounded-full flex items-center gap-1.5 shadow-sm"><Check size={16} /><span>완료</span></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-6 space-y-8">
          <input type="text" value={editingRecipe.title} onChange={(e) => updateEditingRecipe({ ...editingRecipe, title: e.target.value })} placeholder="도시락 이름을 입력하세요" className="w-full text-2xl font-bold text-slate-800 bg-transparent outline-none py-2 border-b border-transparent focus:border-sky-200" />

          <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100">
            <div className="flex justify-between items-center mb-4">
              <label className="text-base font-bold text-slate-800 flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-sky-400"></span>재료 목록</label>
              <button onClick={addIngredient} className="text-sky-500 bg-sky-50 px-3 py-1.5 rounded-full flex items-center gap-1.5 text-xs font-semibold"><PlusCircle size={14} /> 재료 추가</button>
            </div>
            <div className="space-y-2.5">
              {editingRecipe.ingredients.map((ing, index) => (
                <div key={index} className="flex items-center gap-3 group">
                  <button onClick={() => toggleIngredientCheck(index)} className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${ing.checked ? 'text-sky-500 bg-sky-50' : 'text-slate-300 bg-slate-50'}`}>
                    {ing.checked ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                  </button>
                  <input type="text" value={ing.text} onChange={(e) => updateIngredient(index, e.target.value)} placeholder="예: 계란 2개" className={`flex-1 bg-transparent border-b border-slate-100 py-2 text-[15px] outline-none ${ing.checked ? 'line-through text-slate-400' : 'text-slate-700'}`} />
                  <button onClick={() => removeIngredient(index)} className="text-slate-300 hover:text-red-500 p-1.5"><MinusCircle size={18} /></button>
                </div>
              ))}
            </div>

            <div className="mt-5 pt-5 border-t border-slate-100">
              {!editingRecipe.nutrition ? (
                <button onClick={handleAnalyzeNutrition} disabled={isAnalyzing} className="w-full py-3 bg-slate-50 hover:bg-sky-50 text-slate-600 hover:text-sky-600 rounded-2xl border border-slate-200 hover:border-sky-200 transition-colors flex items-center justify-center gap-2 text-sm font-bold disabled:opacity-50">
                  {isAnalyzing ? <><Loader2 size={16} className="animate-spin" /> 성분 분석 중...</> : <><Activity size={16} /> AI 영양 성분 분석 ✨</>}
                </button>
              ) : (
                <div className="bg-gradient-to-br from-sky-50 to-indigo-50 rounded-2xl p-4 border border-sky-100/50">
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="text-sm font-bold text-sky-800 flex items-center gap-1.5"><Activity size={16} /> 예상 영양 정보</h4>
                    <button onClick={handleAnalyzeNutrition} disabled={isAnalyzing} className="text-xs text-sky-600 bg-white/60 px-2 py-1 rounded-md font-semibold">{isAnalyzing ? "분석 중..." : "다시 분석 ✨"}</button>
                  </div>
                  <div className="grid grid-cols-4 gap-2 mb-3">
                    <div className="bg-white rounded-xl p-2 text-center shadow-sm"><div className="text-[10px] text-slate-400 font-bold">칼로리</div><div className="text-sm font-extrabold text-slate-700">{editingRecipe.nutrition.calories}</div></div>
                    <div className="bg-white rounded-xl p-2 text-center shadow-sm"><div className="text-[10px] text-slate-400 font-bold">단백질</div><div className="text-sm font-extrabold text-slate-700">{editingRecipe.nutrition.protein}g</div></div>
                    <div className="bg-white rounded-xl p-2 text-center shadow-sm"><div className="text-[10px] text-slate-400 font-bold">탄수화물</div><div className="text-sm font-extrabold text-slate-700">{editingRecipe.nutrition.carbs}g</div></div>
                    <div className="bg-white rounded-xl p-2 text-center shadow-sm"><div className="text-[10px] text-slate-400 font-bold">지방</div><div className="text-sm font-extrabold text-slate-700">{editingRecipe.nutrition.fat}g</div></div>
                  </div>
                  <div className="bg-white/60 rounded-xl p-3 text-xs text-slate-600 flex items-start gap-2"><Info size={14} className="text-sky-500 mt-0.5" /><span>{editingRecipe.nutrition.tip}</span></div>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100">
            <div className="flex justify-between items-center mb-4">
              <label className="text-base font-bold text-slate-800 flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-sky-400"></span>만드는 방법</label>
              <button onClick={addStep} className="text-sky-500 bg-sky-50 px-3 py-1.5 rounded-full flex items-center gap-1.5 text-xs font-semibold"><PlusCircle size={14} /> 단계 추가</button>
            </div>
            <div className="space-y-4">
              {editingRecipe.steps.map((step, index) => (
                <div key={index} className="flex items-start gap-3 group">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-xs font-bold mt-1.5">{index + 1}</span>
                  <textarea value={step} onChange={(e) => updateStep(index, e.target.value)} placeholder="조리 과정을 상세히 적어주세요." rows={1} className="flex-1 bg-slate-50 rounded-2xl px-4 py-3 text-[15px] text-slate-700 outline-none resize-none" />
                  <button onClick={() => removeStep(index)} className="text-slate-300 hover:text-red-500 p-1.5 mt-2"><MinusCircle size={18} /></button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderList = () => (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="px-6 pt-12 pb-6 bg-slate-50 relative z-10">
        <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">나만의 도시락</h1>
        <p className="text-slate-500 text-sm mt-1 font-medium">오늘도 맛있는 하루 되세요 ✨</p>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-28 space-y-4">
        {recipes.length === 0 ? (
          <div className="text-center text-slate-400 py-20 flex flex-col items-center">
            <div className="w-20 h-20 bg-sky-50 rounded-full flex items-center justify-center mb-5"><Utensils size={32} className="text-sky-300" /></div>
            <p className="font-medium text-slate-500">아직 등록된 레시피가 없어요</p>
          </div>
        ) : (
          recipes.map(recipe => (
            <div key={recipe.id} onClick={() => handleEdit(recipe)} className="bg-white p-5 rounded-[1.5rem] shadow-sm border border-slate-100 hover:shadow-md transition-all cursor-pointer group">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-[1.1rem] font-bold text-slate-800">{recipe.title || '제목 없음'}</h3>
                <div className="flex gap-1 bg-slate-50 rounded-full p-1 opacity-100">
                  <button onClick={(e) => { e.stopPropagation(); handleEdit(recipe); }} className="text-slate-400 p-1.5"><Edit2 size={14} /></button>
                  <button onClick={(e) => handleDelete(recipe.id, e)} className="text-slate-400 hover:text-red-500 p-1.5"><Trash2 size={14} /></button>
                </div>
              </div>
              
              <div className="text-[13px] text-slate-500 mb-3 flex items-start gap-2">
                <span className="font-semibold text-sky-500 bg-sky-50 px-2 py-0.5 rounded-md flex-shrink-0">재료</span>
                <span className="flex-1">{recipe.ingredients.filter(i => i.text.trim() !== '').map(i => i.text).join(' • ') || '재료 없음'}</span>
              </div>
              
              <div className="text-[13px] text-slate-500 bg-slate-50/80 px-4 py-3 rounded-2xl relative">
                {recipe.steps.find(s => s.trim() !== '') || '조리법 없음'}
                {recipe.steps.filter(s => s.trim() !== '').length > 1 ? '\n...' : ''}
                
                {recipe.steps.some(s => s.trim() !== '') && (
                  <button onClick={(e) => handlePlayAudio(recipe, e)} className="absolute bottom-3 right-3 bg-white/90 shadow-sm border border-slate-100 text-sky-500 px-3 py-1.5 rounded-full flex items-center gap-1.5 text-xs font-bold hover:bg-sky-50">
                    {playingRecipeId === recipe.id ? <><Volume2 size={14} className="animate-pulse text-sky-400" /> 중지</> : <><Volume2 size={14} /> 조리법 듣기 ✨</>}
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="fixed bottom-8 left-0 right-0 px-6 flex justify-end items-end gap-3 z-20 pointer-events-none">
        <button onClick={() => setIsAiModalOpen(true)} className="pointer-events-auto h-14 px-5 bg-white text-slate-700 border border-slate-200 rounded-full shadow-lg flex items-center gap-2"><Sparkles size={20} className="text-sky-500" /><span className="font-bold text-[15px]">AI 추천</span></button>
        <button onClick={handleAddNew} className="pointer-events-auto w-14 h-14 bg-sky-500 text-white rounded-full shadow-lg flex items-center justify-center"><Plus size={26} /></button>
      </div>
    </div>
  );

  return (
    <div className="w-full h-screen max-w-md mx-auto bg-slate-50 shadow-2xl relative overflow-hidden font-sans">
      {currentView === 'list' ? renderList() : renderEditor()}

      {isAiModalOpen && (
        <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm z-50 flex items-center justify-center p-5">
          <div className="bg-white rounded-[2rem] w-full max-w-sm shadow-2xl p-6">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2 bg-sky-50 text-sky-600 px-3 py-1.5 rounded-full"><Sparkles size={16} /><h3 className="font-bold text-sm">AI 레시피 생성</h3></div>
              <button onClick={() => !isGenerating && setIsAiModalOpen(false)} className="text-slate-400 bg-slate-50 p-2 rounded-full"><X size={18} /></button>
            </div>
            <div className="space-y-5">
              <p className="text-[15px] text-slate-600 font-medium">재료나 먹고 싶은 음식의 키워드를 적어주시면, AI가 뚝딱 레시피를 만들어드려요.</p>
              <textarea value={aiInput} onChange={(e) => setAiInput(e.target.value)} disabled={isGenerating} placeholder="예: 계란, 스팸, 김치" className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-[15px] outline-none h-28" />
              <button onClick={handleGenerateAiRecipe} disabled={isGenerating || !aiInput.trim()} className="w-full py-4 bg-slate-900 text-white font-bold rounded-2xl flex justify-center items-center gap-2 disabled:opacity-50">
                {isGenerating ? <><Loader2 size={20} className="animate-spin" /> 레시피 짓는 중...</> : "레시피 만들기"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
